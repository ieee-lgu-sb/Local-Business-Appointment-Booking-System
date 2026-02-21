import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, BarChart3, CalendarDays, Check, Shield, Wrench } from "lucide-react";

const APPOINTMENT_STATUS_OPTIONS = [
  "pending",
  "approved",
  "rescheduled",
  "cancelled",
  "completed"
];

const WEEK_DAYS = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 }
];

const DEFAULT_AVAILABILITY = {
  startTime: "09:00",
  endTime: "17:00",
  slotDurationMinutes: 60,
  breakStartTime: "13:00",
  breakEndTime: "14:00",
  workingDays: [1, 2, 3, 4, 5, 6],
  slots: []
};

const DEFAULT_REPORTS = {
  totals: {
    today: 0,
    month: 0,
    allTime: 0
  },
  statusBreakdown: {
    pending: 0,
    approved: 0,
    rescheduled: 0,
    cancelled: 0,
    completed: 0
  },
  dailyTrend: [],
  monthlyTrend: [],
  servicePerformance: []
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeReports = (raw = {}) => ({
  totals: {
    today: toNumber(raw?.totals?.today),
    month: toNumber(raw?.totals?.month),
    allTime: toNumber(raw?.totals?.allTime)
  },
  statusBreakdown: {
    pending: toNumber(raw?.statusBreakdown?.pending),
    approved: toNumber(raw?.statusBreakdown?.approved),
    rescheduled: toNumber(raw?.statusBreakdown?.rescheduled),
    cancelled: toNumber(raw?.statusBreakdown?.cancelled),
    completed: toNumber(raw?.statusBreakdown?.completed)
  },
  dailyTrend: Array.isArray(raw?.dailyTrend) ? raw.dailyTrend : [],
  monthlyTrend: Array.isArray(raw?.monthlyTrend) ? raw.monthlyTrend : [],
  servicePerformance: Array.isArray(raw?.servicePerformance) ? raw.servicePerformance : []
});

function AdminDashboard({ token, apiRequest, onLogout }) {
  const [services, setServices] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [availability, setAvailability] = useState(DEFAULT_AVAILABILITY);
  const [reports, setReports] = useState(DEFAULT_REPORTS);
  const [serviceDrafts, setServiceDrafts] = useState({});
  const [statusDrafts, setStatusDrafts] = useState({});
  const [newService, setNewService] = useState({
    name: "",
    description: "",
    durationMinutes: 30,
    price: 0
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const mapService = useCallback((service) => ({
    id: service._id,
    name: service.name,
    description: service.description || "",
    durationMinutes: service.durationMinutes || 30,
    price: typeof service.price === "number" ? service.price : 0,
    isActive: Boolean(service.isActive)
  }), []);

  const loadDashboard = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [servicesData, appointmentsData, availabilityData, reportsData] = await Promise.all([
        apiRequest("/admin/services", { token }),
        apiRequest("/admin/appointments", { token }),
        apiRequest("/admin/availability", { token }),
        apiRequest("/admin/reports", { token })
      ]);

      const mappedServices = (servicesData.services || []).map(mapService);
      setServices(mappedServices);
      setServiceDrafts(
        mappedServices.reduce((acc, item) => ({ ...acc, [item.id]: item }), {})
      );

      setAppointments(appointmentsData.appointments || []);
      setStatusDrafts(
        (appointmentsData.appointments || []).reduce(
          (acc, item) => ({ ...acc, [item._id]: item.status || "pending" }),
          {}
        )
      );
      setAvailability(availabilityData.availability || DEFAULT_AVAILABILITY);
      setReports(normalizeReports(reportsData.reports));
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Failed to load admin dashboard." });
    } finally {
      setLoading(false);
    }
  }, [token, apiRequest, mapService]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const completionRate = useMemo(() => {
    if (!reports.totals.allTime) return 0;
    return Math.round((reports.statusBreakdown.completed / reports.totals.allTime) * 100);
  }, [reports]);

  const handleCreateService = async () => {
    setSaving(true);
    try {
      await apiRequest("/admin/services", {
        method: "POST",
        token,
        body: {
          name: newService.name.trim(),
          description: newService.description.trim(),
          durationMinutes: Number(newService.durationMinutes),
          price: Number(newService.price),
          isActive: true
        }
      });
      setNewService({ name: "", description: "", durationMinutes: 30, price: 0 });
      setMessage({ type: "success", text: "Service created successfully." });
      await loadDashboard();
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Failed to create service." });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveService = async (serviceId) => {
    setSaving(true);
    try {
      await apiRequest(`/admin/services/${serviceId}`, {
        method: "PATCH",
        token,
        body: serviceDrafts[serviceId]
      });
      setMessage({ type: "success", text: "Service updated." });
      await loadDashboard();
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Failed to update service." });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAvailability = async () => {
    setSaving(true);
    try {
      await apiRequest("/admin/availability", {
        method: "PATCH",
        token,
        body: {
          startTime: availability.startTime,
          endTime: availability.endTime,
          slotDurationMinutes: Number(availability.slotDurationMinutes),
          breakStartTime: availability.breakStartTime,
          breakEndTime: availability.breakEndTime,
          workingDays: availability.workingDays
        }
      });
      setMessage({ type: "success", text: "Availability updated." });
      await loadDashboard();
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Failed to update availability." });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAppointmentStatus = async (appointmentId) => {
    setSaving(true);
    try {
      await apiRequest(`/admin/appointments/${appointmentId}`, {
        method: "PATCH",
        token,
        body: { status: statusDrafts[appointmentId] }
      });
      setMessage({ type: "success", text: "Appointment status updated." });
      await loadDashboard();
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Failed to update appointment." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <main className="shell"><p>Loading admin dashboard...</p></main>;

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero__content">
          <span className="hero__tag"><Shield size={14} />Admin Dashboard</span>
          <h1>Manage services, availability, and appointments</h1>
          <p>Business owner controls</p>
        </div>
        <div className="hero__card">
          <div className="hero__card-header"><span className="pulse-dot" />Overview</div>
          <div className="admin-overview"><strong>{services.length}</strong><span>Services</span></div>
          <div className="admin-overview"><strong>{appointments.length}</strong><span>Total appointments</span></div>
          <div className="admin-overview"><strong>{reports.totals.today}</strong><span>Today</span></div>
          <button type="button" className="primary-btn" onClick={onLogout}>Logout</button>
        </div>
      </section>

      {message.text ? <div className={`api-message api-message--banner ${message.type || "info"}`}>{message.type === "error" ? <AlertCircle size={14} /> : <Check size={14} />}<span>{message.text}</span></div> : null}

      <section className="card">
        <header className="card__header"><span className="card__icon card__icon--teal"><BarChart3 size={18} /></span><div><h2>Reports & Analytics</h2><p>Daily/monthly totals and service performance</p></div></header>
        <div className="card__body admin-stack">
          <div className="report-kpi-grid">
            <div className="report-kpi"><span>Daily appointments</span><strong>{reports.totals.today}</strong></div>
            <div className="report-kpi"><span>Monthly appointments</span><strong>{reports.totals.month}</strong></div>
            <div className="report-kpi"><span>All-time appointments</span><strong>{reports.totals.allTime}</strong></div>
            <div className="report-kpi"><span>Completion rate</span><strong>{completionRate}%</strong></div>
          </div>

          <div className="report-trends-grid">
            <div className="report-panel">
              <h3>Last 7 days</h3>
              {!reports.dailyTrend.length ? <p>No daily data.</p> : (
                <div className="report-list">
                  {reports.dailyTrend.map((item) => (
                    <div key={item.key} className="report-row">
                      <span>{item.label}</span>
                      <strong>{item.total}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="report-panel">
              <h3>Last 6 months</h3>
              {!reports.monthlyTrend.length ? <p>No monthly data.</p> : (
                <div className="report-list">
                  {reports.monthlyTrend.map((item) => (
                    <div key={item.key} className="report-row">
                      <span>{item.label}</span>
                      <strong>{item.total}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="report-trends-grid">
            <div className="report-panel">
              <h3>Status breakdown</h3>
              <div className="report-list">
                {Object.entries(reports.statusBreakdown).map(([status, total]) => (
                  <div key={status} className="report-row">
                    <span className="capitalize">{status}</span>
                    <strong>{total}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="report-panel">
              <h3>Service performance</h3>
              {!reports.servicePerformance.length ? <p>No service performance yet.</p> : (
                <div className="report-list">
                  {reports.servicePerformance.map((item) => (
                    <div key={item._id || item.serviceName} className="report-row">
                      <span>{item.serviceName}</span>
                      <strong>{toNumber(item.total)}</strong>
                      <small>{`Done ${toNumber(item.completed)} | Cancelled ${toNumber(item.cancelled)}`}</small>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="admin-grid">
        <section className="card">
          <header className="card__header"><span className="card__icon card__icon--orange"><Wrench size={18} /></span><div><h2>Services</h2><p>Add, edit, and activate/deactivate services</p></div></header>
          <div className="card__body admin-stack">
            <div className="admin-form-grid">
              <input value={newService.name} onChange={(e) => setNewService((prev) => ({ ...prev, name: e.target.value }))} placeholder="Service name" />
              <input value={newService.durationMinutes} onChange={(e) => setNewService((prev) => ({ ...prev, durationMinutes: e.target.value }))} placeholder="Duration (minutes)" type="number" />
              <input value={newService.price} onChange={(e) => setNewService((prev) => ({ ...prev, price: e.target.value }))} placeholder="Price" type="number" />
              <input value={newService.description} onChange={(e) => setNewService((prev) => ({ ...prev, description: e.target.value }))} placeholder="Description" />
              <button type="button" className="primary-btn" disabled={saving || !newService.name.trim()} onClick={handleCreateService}>Add service</button>
            </div>

            {services.map((service) => (
              <div key={service.id} className="admin-row">
                <input value={serviceDrafts[service.id]?.name || ""} onChange={(e) => setServiceDrafts((prev) => ({ ...prev, [service.id]: { ...prev[service.id], name: e.target.value } }))} />
                <input type="number" value={serviceDrafts[service.id]?.durationMinutes || 0} onChange={(e) => setServiceDrafts((prev) => ({ ...prev, [service.id]: { ...prev[service.id], durationMinutes: Number(e.target.value) } }))} />
                <input type="number" value={serviceDrafts[service.id]?.price || 0} onChange={(e) => setServiceDrafts((prev) => ({ ...prev, [service.id]: { ...prev[service.id], price: Number(e.target.value) } }))} />
                <label className="admin-checkbox"><input type="checkbox" checked={Boolean(serviceDrafts[service.id]?.isActive)} onChange={(e) => setServiceDrafts((prev) => ({ ...prev, [service.id]: { ...prev[service.id], isActive: e.target.checked } }))} /> Active</label>
                <button type="button" className="ghost-btn" disabled={saving} onClick={() => handleSaveService(service.id)}>Save</button>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <header className="card__header"><span className="card__icon card__icon--violet"><CalendarDays size={18} /></span><div><h2>Availability</h2><p>Control working hours and generated slots</p></div></header>
          <div className="card__body admin-stack">
            <div className="admin-form-grid">
              <label>Start time<input type="time" value={availability.startTime || ""} onChange={(e) => setAvailability((prev) => ({ ...prev, startTime: e.target.value }))} /></label>
              <label>End time<input type="time" value={availability.endTime || ""} onChange={(e) => setAvailability((prev) => ({ ...prev, endTime: e.target.value }))} /></label>
              <label>Slot minutes<input type="number" value={availability.slotDurationMinutes || 60} onChange={(e) => setAvailability((prev) => ({ ...prev, slotDurationMinutes: Number(e.target.value) }))} /></label>
              <label>Break start<input type="time" value={availability.breakStartTime || ""} onChange={(e) => setAvailability((prev) => ({ ...prev, breakStartTime: e.target.value }))} /></label>
              <label>Break end<input type="time" value={availability.breakEndTime || ""} onChange={(e) => setAvailability((prev) => ({ ...prev, breakEndTime: e.target.value }))} /></label>
            </div>
            <div className="admin-days">
              {WEEK_DAYS.map((day) => (
                <label key={day.value} className="admin-checkbox">
                  <input
                    type="checkbox"
                    checked={(availability.workingDays || []).includes(day.value)}
                    onChange={(e) => {
                      setAvailability((prev) => ({
                        ...prev,
                        workingDays: e.target.checked
                          ? [...(prev.workingDays || []), day.value].sort()
                          : (prev.workingDays || []).filter((item) => item !== day.value)
                      }));
                    }}
                  />
                  {day.label}
                </label>
              ))}
            </div>
            <div className="admin-slot-preview">
              {(availability.slots || []).map((slot) => <span key={slot}>{slot}</span>)}
            </div>
            <button type="button" className="primary-btn" disabled={saving} onClick={handleSaveAvailability}>Save availability</button>
          </div>
        </section>
      </section>

      <section className="card">
        <header className="card__header"><span className="card__icon card__icon--teal"><CalendarDays size={18} /></span><div><h2>Appointments</h2><p>Approve, reschedule, cancel, or complete bookings</p></div></header>
        <div className="card__body admin-stack">
          {appointments.map((appointment) => (
            <div key={appointment._id} className="admin-row admin-row--appointments">
              <div>
                <strong>{appointment.service?.name || "Service"}</strong>
                <p>{appointment.customer?.name || "Customer"} - {appointment.startTime} - {new Date(appointment.appointmentDate).toLocaleDateString()}</p>
              </div>
              <select value={statusDrafts[appointment._id] || appointment.status} onChange={(e) => setStatusDrafts((prev) => ({ ...prev, [appointment._id]: e.target.value }))}>
                {APPOINTMENT_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <button type="button" className="ghost-btn" disabled={saving} onClick={() => handleSaveAppointmentStatus(appointment._id)}>Update</button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export default AdminDashboard;
