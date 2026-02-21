import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import {
  AlertCircle,
  Calendar,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  Heart,
  Mail,
  MapPin,
  Phone,
  Shield,
  Sparkles,
  Star,
  Stethoscope,
  TrendingUp,
  User,
  XCircle
} from "lucide-react";
import "./App.css";
import AdminDashboard from "./AdminDashboard";

const API_BASE_CANDIDATES = [
  process.env.REACT_APP_API_BASE_URL,
  "http://localhost:5000/api",
  "/api"
].filter(Boolean);
const API_BASE_STORAGE_KEY = "booking_api_base";
const SESSION_TOKEN_KEY = "booking_token";
const SESSION_USER_KEY = "booking_user";
const DEFAULT_TIME_SLOTS = ["09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM"];
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5, 6];
const WORKING_DAYS_ERROR_MESSAGE = "Selected date is outside configured working days.";

const DETAILS_SCHEMA = Yup.object({
  fullName: Yup.string().required("Full name is required"),
  email: Yup.string().email("Enter a valid email").required("Email is required"),
  phone: Yup.string().matches(/^[+\d\s\-()]{7,}$/u, "Enter a valid phone number").required("Phone is required"),
  notes: Yup.string()
});

const SERVICE_META = {
  "General Consultation": { tag: "Popular", color: "linear-gradient(135deg, #fb7185, #fb923c)" },
  "Skin Care Session": { tag: "New", color: "linear-gradient(135deg, #a78bfa, #7c3aed)" },
  "Business Coaching": { tag: "Pro", color: "linear-gradient(135deg, #34d399, #0ea5a3)" },
  "Salon Services": { tag: "Trending", color: "linear-gradient(135deg, #f472b6, #fb7185)" }
};

const parseStoredUser = () => {
  try {
    const raw = localStorage.getItem(SESSION_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const toDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateValue = (value) => {
  if (!value) return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/u);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const generateCalendarDays = () => {
  const today = new Date();
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return {
      id: toDateKey(date),
      date: date.getDate(),
      dayName: date.toLocaleDateString("en-US", { weekday: "short" }),
      month: date.toLocaleDateString("en-US", { month: "short" }),
      isToday: index === 0
    };
  });
};

const formatDisplayDate = (value) => {
  const date = parseDateValue(value);
  if (!date) return "";
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
};

const parseTimeToMinutes = (value) => {
  const [timePart, period] = value.split(" ");
  const [rawHours, rawMinutes] = timePart.split(":").map(Number);
  let hours = rawHours;
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return hours * 60 + rawMinutes;
};

const minutesToTime = (totalMinutes) => {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
};

const normalizeError = (error, fallback) => (error instanceof Error && error.message ? error.message : fallback);
const isSlotConflictError = (text) =>
  typeof text === "string" && text.toLowerCase().includes("selected slot is already booked");
const isWorkingDaysError = (text) =>
  typeof text === "string" && text.toLowerCase().includes("outside configured working days");
const getAppointmentServiceId = (serviceValue) => {
  if (!serviceValue) return "";
  if (typeof serviceValue === "string") return serviceValue;
  return serviceValue._id || serviceValue.id || "";
};
const buildServiceDateKey = (dateKey, serviceId) => `${dateKey}::${serviceId || "none"}`;

const isNetworkError = (error) =>
  error?.name === "AbortError" ||
  error?.message === "Failed to fetch" ||
  error?.message === "Network request failed";

const normalizeApiBase = (base) => {
  if (!base || typeof base !== "string") return "";
  const trimmed = base.trim().replace(/\/+$/u, "");
  if (!trimmed) return "";
  if (trimmed === "/api") return "/api";
  if (trimmed.endsWith("/api")) return trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return `${trimmed}/api`;
  return trimmed;
};

const buildCandidates = () => {
  const preferredRaw = localStorage.getItem(API_BASE_STORAGE_KEY);
  const preferred = normalizeApiBase(preferredRaw);
  if (preferredRaw && !preferred) localStorage.removeItem(API_BASE_STORAGE_KEY);

  const merged = preferred
    ? [preferred, ...API_BASE_CANDIDATES.map(normalizeApiBase)]
    : API_BASE_CANDIDATES.map(normalizeApiBase);
  return [...new Set(merged.filter(Boolean))];
};

async function apiRequest(path, { method = "GET", token = "", body } = {}) {
  const candidates = buildCandidates();
  let lastError = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      });
      clearTimeout(timeoutId);

      let data = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        const canFallbackOnHttp =
          index < candidates.length - 1 &&
          (response.status === 404 || response.status === 502 || response.status === 503) &&
          (baseUrl === "/api" || baseUrl.includes("localhost"));
        if (canFallbackOnHttp) {
          continue;
        }
        throw new Error(data.message || `Request failed with status ${response.status}.`);
      }

      localStorage.setItem(API_BASE_STORAGE_KEY, baseUrl);
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;

      const shouldTryNext = isNetworkError(error) && index < candidates.length - 1;
      if (shouldTryNext) continue;
      break;
    }
  }

  if (isNetworkError(lastError)) {
    throw new Error("Backend is unreachable. Start backend server and check API base URL.");
  }

  throw lastError || new Error("Request failed.");
}

function App() {
  const calendarDays = useMemo(() => generateCalendarDays(), []);
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [token, setToken] = useState(() => localStorage.getItem(SESSION_TOKEN_KEY) || "");
  const [currentUser, setCurrentUser] = useState(() => parseStoredUser());
  const [authMode, setAuthMode] = useState("login");
  const [authMessage, setAuthMessage] = useState({ type: "", text: "" });
  const [message, setMessage] = useState({ type: "", text: "" });
  const [historyMessage, setHistoryMessage] = useState({ type: "", text: "" });

  const [services, setServices] = useState([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedDate, setSelectedDate] = useState(calendarDays[0]?.id || "");
  const [selectedTime, setSelectedTime] = useState("");
  const [availabilitySlots, setAvailabilitySlots] = useState(DEFAULT_TIME_SLOTS);
  const [availabilityWorkingDays, setAvailabilityWorkingDays] = useState(DEFAULT_WORKING_DAYS);
  const [appointments, setAppointments] = useState([]);
  const [conflictBlockedSlots, setConflictBlockedSlots] = useState({});
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [lastCreatedAppointment, setLastCreatedAppointment] = useState(null);
  const [highlightAvailability, setHighlightAvailability] = useState(false);

  const availabilityRef = useRef(null);
  const highlightTimer = useRef(null);
  const isAdminRoute = pathname.startsWith("/admin");

  const navigate = useCallback((nextPath) => {
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
      setPathname(nextPath);
    }
  }, []);

  const formik = useFormik({
    initialValues: { fullName: "", email: "", phone: "", notes: "" },
    validationSchema: DETAILS_SCHEMA,
    onSubmit: () => { }
  });

  const authFormik = useFormik({
    initialValues: { name: "", email: "", password: "", phone: "" },
    validationSchema: Yup.object({
      name: authMode === "signup" ? Yup.string().required("Name is required") : Yup.string(),
      email: Yup.string().email("Enter a valid email").required("Email is required"),
      password: Yup.string().min(6, "At least 6 characters").required("Password is required"),
      phone:
        authMode === "signup"
          ? Yup.string().matches(/^[+\d\s\-()]{7,}$/u, "Enter a valid phone number").required("Phone is required")
          : Yup.string()
    }),
    enableReinitialize: true,
    onSubmit: async (values, { setSubmitting }) => {
      try {
        setAuthMessage({ type: "", text: "" });
        const endpoint = authMode === "signup" ? "/auth/signup" : "/auth/login";
        const payload = authMode === "signup"
          ? { name: values.name.trim(), email: values.email.trim(), password: values.password, phone: values.phone.trim() }
          : { email: values.email.trim(), password: values.password };
        const data = await apiRequest(endpoint, { method: "POST", body: payload });

        setToken(data.token);
        setCurrentUser(data.user);
        localStorage.setItem(SESSION_TOKEN_KEY, data.token);
        localStorage.setItem(SESSION_USER_KEY, JSON.stringify(data.user));
        formik.setValues((prev) => ({
          ...prev,
          fullName: prev.fullName || data.user?.name || "",
          email: prev.email || data.user?.email || "",
          phone: prev.phone || data.user?.phone || ""
        }));
        setAuthMessage({
          type: "success",
          text: authMode === "signup" ? "Account created." : "Logged in."
        });
        authFormik.resetForm({ values: { name: "", email: values.email, password: "", phone: "" } });
      } catch (error) {
        setAuthMessage({ type: "error", text: normalizeError(error, "Authentication failed.") });
      } finally {
        setSubmitting(false);
      }
    }
  });

  const adminAuthFormik = useFormik({
    initialValues: { email: "", password: "" },
    validationSchema: Yup.object({
      email: Yup.string().email("Enter a valid email").required("Email is required"),
      password: Yup.string().min(6, "At least 6 characters").required("Password is required")
    }),
    onSubmit: async (values, { setSubmitting }) => {
      try {
        setAuthMessage({ type: "", text: "" });
        const data = await apiRequest("/auth/admin/login", {
          method: "POST",
          body: { email: values.email.trim(), password: values.password }
        });
        setToken(data.token);
        setCurrentUser(data.user);
        localStorage.setItem(SESSION_TOKEN_KEY, data.token);
        localStorage.setItem(SESSION_USER_KEY, JSON.stringify(data.user));
        setAuthMessage({ type: "success", text: "Admin logged in." });
      } catch (error) {
        setAuthMessage({ type: "error", text: normalizeError(error, "Admin login failed.") });
      } finally {
        setSubmitting(false);
      }
    }
  });

  const loadServices = useCallback(async () => {
    const data = await apiRequest("/services");
    const mapped = (data.services || []).map((item) => ({
      id: item._id,
      name: item.name,
      duration: item.durationMinutes || 30,
      price: typeof item.price === "number" ? item.price : 0,
      description: item.description || "Professional appointment service",
      ...SERVICE_META[item.name]
    }));
    setServices(mapped);
    if (mapped.length && !selectedServiceId) {
      setSelectedServiceId(mapped[0].id);
    }
  }, [selectedServiceId]);

  const loadAvailability = useCallback(async () => {
    const data = await apiRequest("/availability");
    const slots = data?.availability?.slots || DEFAULT_TIME_SLOTS;
    const workingDays = Array.isArray(data?.availability?.workingDays)
      ? data.availability.workingDays
      : DEFAULT_WORKING_DAYS;
    setAvailabilitySlots(slots.length ? slots : DEFAULT_TIME_SLOTS);
    setAvailabilityWorkingDays(workingDays);
  }, []);

  const loadAppointments = useCallback(async () => {
    if (!token) {
      setAppointments([]);
      return;
    }
    setAppointmentsLoading(true);
    try {
      const data = await apiRequest("/appointments", { token });
      setAppointments(data.appointments || []);
    } catch (error) {
      setMessage({ type: "error", text: normalizeError(error, "Failed to fetch appointments.") });
    } finally {
      setAppointmentsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isAdminRoute) return;
    loadServices().catch((error) => setMessage({ type: "error", text: normalizeError(error, "Failed to load services.") }));
  }, [isAdminRoute, loadServices]);

  useEffect(() => {
    if (isAdminRoute) return;
    loadAvailability().catch((error) => setMessage({ type: "error", text: normalizeError(error, "Failed to load availability.") }));
  }, [isAdminRoute, loadAvailability]);

  useEffect(() => {
    if (isAdminRoute) return;
    loadAppointments();
  }, [isAdminRoute, loadAppointments]);

  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    },
    []
  );

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (currentUser?.role === "admin" && !isAdminRoute) {
      navigate("/admin");
    }
  }, [currentUser?.role, isAdminRoute, navigate]);

  const selectedService = useMemo(() => services.find((item) => item.id === selectedServiceId), [services, selectedServiceId]);
  const selectedDateObject = useMemo(() => parseDateValue(selectedDate), [selectedDate]);
  const selectedDayIndex = selectedDateObject ? selectedDateObject.getDay() : null;
  const selectedDayIsWorking = selectedDayIndex !== null && availabilityWorkingDays.includes(selectedDayIndex);
  const selectedServiceDateKey = useMemo(
    () => buildServiceDateKey(selectedDate, selectedServiceId),
    [selectedDate, selectedServiceId]
  );

  const bookedTimes = useMemo(() => {
    if (!selectedServiceId) return new Set();
    const key = selectedDate;
    const set = new Set();
    appointments.forEach((appointment) => {
      if (!appointment.appointmentDate || appointment.status === "cancelled") return;
      const appointmentServiceId = getAppointmentServiceId(appointment.service);
      if (appointmentServiceId !== selectedServiceId) return;
      const day = parseDateValue(appointment.appointmentDate);
      if (!day) return;
      const dayKey = toDateKey(day);
      if (dayKey === key) set.add(appointment.startTime);
    });
    return set;
  }, [appointments, selectedDate, selectedServiceId]);

  const blockedTimes = useMemo(() => {
    const merged = new Set(bookedTimes);
    const locallyBlocked = conflictBlockedSlots[selectedServiceDateKey] || [];
    locallyBlocked.forEach((time) => merged.add(time));
    return merged;
  }, [bookedTimes, conflictBlockedSlots, selectedServiceDateKey]);

  const slots = useMemo(
    () =>
      availabilitySlots.map((time) => ({
        time,
        available: selectedDayIsWorking && !blockedTimes.has(time)
      })),
    [availabilitySlots, blockedTimes, selectedDayIsWorking]
  );

  const firstAvailableTime = slots.find((slot) => slot.available)?.time || "--";
  const selectedTimeAvailable = Boolean(selectedTime && !blockedTimes.has(selectedTime));
  const detailsValid = useMemo(() => {
    try {
      DETAILS_SCHEMA.validateSync(formik.values, { abortEarly: false });
      return true;
    } catch {
      return false;
    }
  }, [formik.values]);

  const canConfirm = Boolean(
    token &&
    selectedService &&
    selectedDate &&
    selectedDayIsWorking &&
    selectedTimeAvailable &&
    detailsValid &&
    !submitting
  );

  useEffect(() => {
    if (!selectedDateObject || selectedDayIsWorking) return;
    setSelectedTime("");
    setHistoryMessage({ type: "error", text: WORKING_DAYS_ERROR_MESSAGE });
  }, [selectedDateObject, selectedDayIsWorking]);

  useEffect(() => {
    if (selectedTime && blockedTimes.has(selectedTime)) {
      setSelectedTime("");
    }
  }, [selectedTime, blockedTimes]);

  const handleAvailabilityRefresh = async () => {
    availabilityRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightAvailability(true);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightAvailability(false), 1200);

    if (!token) {
      setMessage({ type: "info", text: "Login to load live availability." });
      return;
    }

    setCheckingAvailability(true);
    await loadAppointments();
    setCheckingAvailability(false);
    setHistoryMessage({ type: "", text: "" });
    setMessage({ type: "success", text: "Availability refreshed from backend." });
  };

  const handleConfirm = async () => {
    const errors = await formik.validateForm();
    if (Object.keys(errors).length) {
      formik.setTouched({ fullName: true, email: true, phone: true, notes: true });
      return;
    }
    if (!canConfirm || !selectedService) return;

    setSubmitting(true);
    try {
      const endTime = minutesToTime(parseTimeToMinutes(selectedTime) + selectedService.duration);
      const payload = { service: selectedService.id, appointmentDate: selectedDate, startTime: selectedTime, endTime, notes: formik.values.notes.trim() };
      const data = await apiRequest("/appointments", { method: "POST", token, body: payload });
      setLastCreatedAppointment(data.appointment || null);
      setShowModal(true);
      await loadAppointments();
      setHistoryMessage({ type: "", text: "" });
      setMessage({ type: "success", text: "Appointment created successfully." });
    } catch (error) {
      const errorText = normalizeError(error, "Failed to create appointment.");
      if (isSlotConflictError(errorText)) {
        setMessage({ type: "", text: "" });
        setHistoryMessage({
          type: "error",
          text: "Selected slot is already booked. Choose another slot."
        });
        setConflictBlockedSlots((prev) => {
          const existing = prev[selectedServiceDateKey] || [];
          if (existing.includes(selectedTime)) {
            return prev;
          }
          return {
            ...prev,
            [selectedServiceDateKey]: [...existing, selectedTime]
          };
        });
        setSelectedTime("");
        await loadAppointments();
      } else if (isWorkingDaysError(errorText)) {
        setMessage({ type: "", text: "" });
        setSelectedTime("");
        setHistoryMessage({ type: "error", text: WORKING_DAYS_ERROR_MESSAGE });
      } else {
        setMessage({ type: "error", text: errorText });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (appointmentId) => {
    try {
      await apiRequest(`/appointments/${appointmentId}`, { method: "PATCH", token, body: { status: "cancelled" } });
      await loadAppointments();
      setMessage({ type: "success", text: "Appointment cancelled." });
    } catch (error) {
      setMessage({ type: "error", text: normalizeError(error, "Failed to cancel appointment.") });
    }
  };

  const handleLogout = () => {
    setToken("");
    setCurrentUser(null);
    setAppointments([]);
    setConflictBlockedSlots({});
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(SESSION_USER_KEY);
    setAuthMessage({ type: "info", text: "Logged out." });
  };

  if (isAdminRoute) {
    return (
      <div className="app">
        <nav className="topbar">
          <div className="topbar__inner">
            <div className="brand"><span className="brand__icon"><CalendarCheck size={16} /></span><span className="brand__name">BookEasy</span></div>
            <div className="auth-state">
              <button className="auth-link" type="button" onClick={() => navigate("/")}>Customer Page</button>
              {token ? <button className="auth-link" type="button" onClick={handleLogout}>Logout</button> : null}
            </div>
          </div>
        </nav>

        {currentUser?.role === "admin" && token ? (
          <AdminDashboard
            token={token}
            apiRequest={apiRequest}
            onLogout={handleLogout}
          />
        ) : (
          <main className="shell">
            <section className="card">
              <header className="card__header">
                <span className="card__icon card__icon--teal"><Shield size={18} /></span>
                <div><h2>Admin Login</h2><p>Sign in to open the admin dashboard</p></div>
              </header>
              <div className="card__body">
                <form className="auth-form" onSubmit={adminAuthFormik.handleSubmit}>
                  <label className="field">
                    <span>Email <span className="field__required">*</span></span>
                    <div className={`field__control ${adminAuthFormik.touched.email && adminAuthFormik.errors.email ? "error" : ""}`}>
                      <Mail size={14} />
                      <input
                        type="email"
                        name="email"
                        value={adminAuthFormik.values.email}
                        onChange={adminAuthFormik.handleChange}
                        onBlur={adminAuthFormik.handleBlur}
                        placeholder="admin@example.com"
                      />
                    </div>
                    {adminAuthFormik.touched.email && adminAuthFormik.errors.email ? <span className="error-text">{adminAuthFormik.errors.email}</span> : null}
                  </label>
                  <label className="field">
                    <span>Password <span className="field__required">*</span></span>
                    <div className={`field__control ${adminAuthFormik.touched.password && adminAuthFormik.errors.password ? "error" : ""}`}>
                      <Shield size={14} />
                      <input
                        type="password"
                        name="password"
                        value={adminAuthFormik.values.password}
                        onChange={adminAuthFormik.handleChange}
                        onBlur={adminAuthFormik.handleBlur}
                        placeholder="********"
                      />
                    </div>
                    {adminAuthFormik.touched.password && adminAuthFormik.errors.password ? <span className="error-text">{adminAuthFormik.errors.password}</span> : null}
                  </label>
                  <button className="primary-btn auth-submit" type="submit">
                    {adminAuthFormik.isSubmitting ? "Please wait..." : "Sign in as admin"}
                  </button>
                </form>
                {authMessage.text ? <div className={`api-message ${authMessage.type || "info"}`}>{authMessage.type === "error" ? <AlertCircle size={14} /> : <Check size={14} />}<span>{authMessage.text}</span></div> : null}
              </div>
            </section>
          </main>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <nav className="topbar">
        <div className="topbar__inner">
          <div className="brand"><span className="brand__icon"><CalendarCheck size={16} /></span><span className="brand__name">BookEasy</span></div>
          {token ? <div className="auth-state"><span>{currentUser?.email || "Signed in"}</span><button className="auth-link" type="button" onClick={handleLogout}>Logout</button></div> : <span className="status-pill"><span className="status-dot" />Guest mode</span>}
        </div>
      </nav>

      <main className="shell">
        <section className="hero">
          <div className="hero__content">
            <span className="hero__tag"><Sparkles size={14} />Local Business Appointment</span>
            <h1>Book your<span className="hero__accent"> perfect time</span></h1>
            <p>Day 8: frontend is connected with backend auth, services, and appointments APIs.</p>
            <div className="hero__stats">
              <div className="stat"><span className="stat__icon stat__icon--amber"><TrendingUp size={18} /></span><div><strong>92%</strong><span>Return rate</span></div></div>
              <div className="stat"><span className="stat__icon stat__icon--violet"><Star size={18} /></span><div><strong>4.9/5</strong><span>Client rating</span></div></div>
            </div>
          </div>
          <div className="hero__card">
            <div className="hero__card-header"><span className="pulse-dot" />Next available</div>
            <div className="hero__card-main"><p className="hero__card-date">{formatDisplayDate(selectedDate)}</p><p className="hero__card-time">{selectedTime || firstAvailableTime}</p></div>
            <button className="primary-btn" type="button" onClick={handleAvailabilityRefresh}>{checkingAvailability ? "Refreshing..." : "Check availability"}<ChevronRight size={16} /></button>
            <div className="hero__card-footer"><div><Shield size={14} /> Secure booking</div><div><Heart size={14} /> Trusted by 10K+</div></div>
          </div>
        </section>

        <section className="card">
          <header className="card__header"><span className="card__icon card__icon--teal"><User size={18} /></span><div><h2>Customer Access</h2><p>Login or signup to create appointments</p></div></header>
          <div className="card__body">
            <div className="auth-panel">
              <div className="auth-tabs">
                <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>Login</button>
                <button type="button" className={authMode === "signup" ? "active" : ""} onClick={() => setAuthMode("signup")}>Signup</button>
              </div>
              {token ? <div className="api-message success">Signed in as <strong>{currentUser?.email}</strong></div> : (
                <form className="auth-form" onSubmit={authFormik.handleSubmit}>
                  {authMode === "signup" ? <label className="field"><span>Name <span className="field__required">*</span></span><div className={`field__control ${authFormik.touched.name && authFormik.errors.name ? "error" : ""}`}><User size={14} /><input name="name" value={authFormik.values.name} onChange={authFormik.handleChange} onBlur={authFormik.handleBlur} /></div>{authFormik.touched.name && authFormik.errors.name ? <span className="error-text">{authFormik.errors.name}</span> : null}</label> : null}
                  <label className="field"><span>Email <span className="field__required">*</span></span><div className={`field__control ${authFormik.touched.email && authFormik.errors.email ? "error" : ""}`}><Mail size={14} /><input type="email" name="email" value={authFormik.values.email} onChange={authFormik.handleChange} onBlur={authFormik.handleBlur} /></div>{authFormik.touched.email && authFormik.errors.email ? <span className="error-text">{authFormik.errors.email}</span> : null}</label>
                  {authMode === "signup" ? <label className="field"><span>Phone <span className="field__required">*</span></span><div className={`field__control ${authFormik.touched.phone && authFormik.errors.phone ? "error" : ""}`}><Phone size={14} /><input name="phone" value={authFormik.values.phone} onChange={authFormik.handleChange} onBlur={authFormik.handleBlur} /></div>{authFormik.touched.phone && authFormik.errors.phone ? <span className="error-text">{authFormik.errors.phone}</span> : null}</label> : null}
                  <label className="field"><span>Password <span className="field__required">*</span></span><div className={`field__control ${authFormik.touched.password && authFormik.errors.password ? "error" : ""}`}><Shield size={14} /><input type="password" name="password" value={authFormik.values.password} onChange={authFormik.handleChange} onBlur={authFormik.handleBlur} /></div>{authFormik.touched.password && authFormik.errors.password ? <span className="error-text">{authFormik.errors.password}</span> : null}</label>
                  <button className="primary-btn auth-submit" type="submit">{authFormik.isSubmitting ? "Please wait..." : authMode === "signup" ? "Create account" : "Sign in"}</button>
                </form>
              )}
              {authMessage.text ? <div className={`api-message ${authMessage.type || "info"}`}>{authMessage.type === "error" ? <AlertCircle size={14} /> : <Check size={14} />}<span>{authMessage.text}</span></div> : null}
            </div>
          </div>
        </section>

        {message.text ? <div className={`api-message api-message--banner ${message.type || "info"}`}>{message.type === "error" ? <AlertCircle size={14} /> : <Check size={14} />}<span>{message.text}</span></div> : null}

        <section className="content">
          <div className="content__main">
            <section className="card">
              <header className="card__header"><span className="card__icon card__icon--orange"><Stethoscope size={18} /></span><div><h2>Select a service</h2><p>Loaded from backend</p></div></header>
              <div className="card__body">
                <div className="service-grid">
                  {services.map((service) => (
                    <button key={service.id} type="button" className={`service-card ${selectedServiceId === service.id ? "selected" : ""}`} onClick={() => setSelectedServiceId(service.id)}>
                      <span className="service-card__check">{selectedServiceId === service.id ? <Check size={14} /> : null}</span>
                      <span className="service-card__icon" style={{ background: service.color }}><Stethoscope size={18} /></span>
                      <div className="service-card__info">
                        <div className="service-card__title"><h3>{service.name}</h3><span className={`tag tag--${(service.tag || "popular").toLowerCase()}`}>{service.tag || "Service"}</span></div>
                        <p>{service.description}</p>
                        <div className="service-card__meta"><span><Clock size={12} /> {service.duration} min</span><span className="price">${service.price}</span></div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section ref={availabilityRef} className={`card ${highlightAvailability ? "highlight" : ""}`}>
              <header className="card__header"><span className="card__icon card__icon--violet"><CalendarDays size={18} /></span><div><h2>Choose date and time</h2><p>Booked slots are disabled</p></div></header>
              <div className="card__body">
                <div className="date-strip scrollbar-hide">{calendarDays.map((day) => <button key={day.id} type="button" onClick={() => { setSelectedDate(day.id); setSelectedTime(""); setHistoryMessage({ type: "", text: "" }); }} className={`date-card ${selectedDate === day.id ? "selected" : ""}`}><span>{day.dayName}</span><strong>{day.date}</strong><small>{day.month}</small>{day.isToday ? <em>Today</em> : null}</button>)}</div>
                <div className="divider" />
                <div className="time-grid">{slots.map((slot) => <button key={slot.time} type="button" disabled={!slot.available} className={`time-slot ${slot.available ? "" : "disabled"} ${selectedTime === slot.time ? "selected" : ""}`} onClick={() => { if (slot.available) { setSelectedTime(slot.time); setHistoryMessage({ type: "", text: "" }); } }}><Clock size={14} />{slot.time}{!slot.available ? <span className="slot-x">x</span> : null}</button>)}</div>
              </div>
            </section>

            <section className="card">
              <header className="card__header"><span className="card__icon card__icon--teal"><User size={18} /></span><div><h2>Your details</h2><p>Used in booking confirmation</p></div></header>
              <div className="card__body">
                <form className="form" onSubmit={formik.handleSubmit}>
                  <div className="form__grid">
                    <label className="field"><span>Full name <span className="field__required">*</span></span><div className={`field__control ${formik.touched.fullName && formik.errors.fullName ? "error" : ""}`}><User size={14} /><input name="fullName" value={formik.values.fullName} onChange={formik.handleChange} onBlur={formik.handleBlur} /></div>{formik.touched.fullName && formik.errors.fullName ? <span className="error-text">{formik.errors.fullName}</span> : null}</label>
                    <label className="field"><span>Email <span className="field__required">*</span></span><div className={`field__control ${formik.touched.email && formik.errors.email ? "error" : ""}`}><Mail size={14} /><input type="email" name="email" value={formik.values.email} onChange={formik.handleChange} onBlur={formik.handleBlur} /></div>{formik.touched.email && formik.errors.email ? <span className="error-text">{formik.errors.email}</span> : null}</label>
                    <label className="field"><span>Phone <span className="field__required">*</span></span><div className={`field__control ${formik.touched.phone && formik.errors.phone ? "error" : ""}`}><Phone size={14} /><input name="phone" value={formik.values.phone} onChange={formik.handleChange} onBlur={formik.handleBlur} /></div>{formik.touched.phone && formik.errors.phone ? <span className="error-text">{formik.errors.phone}</span> : null}</label>
                    <label className="field field--full"><span>Notes</span><div className="field__control"><Calendar size={14} /><textarea name="notes" value={formik.values.notes} onChange={formik.handleChange} onBlur={formik.handleBlur} /></div></label>
                  </div>
                </form>
              </div>
            </section>
          </div>

          <aside className="content__side">
            <div className="summary-card">
              <div className="summary-card__header"><Calendar size={18} />Booking summary</div>
              {selectedService ? <div className="summary-card__body">
                <div className="summary-line"><span className="summary-icon" style={{ background: selectedService.color }}><Stethoscope size={16} /></span><div><strong>{selectedService.name}</strong><p>{selectedService.duration} minutes</p></div></div>
                <div className="summary-line"><span className="summary-icon summary-icon--violet"><CalendarDays size={16} /></span><div><strong>{formatDisplayDate(selectedDate)}</strong><p>{selectedTime || "Select a time"}</p></div></div>
              </div> : <p className="summary-empty">Select a service</p>}
              <div className="summary-card__footer">
                <button type="button" onClick={handleConfirm} disabled={!canConfirm} className={`primary-btn ${canConfirm ? "" : "disabled"}`}>{submitting ? "Booking..." : canConfirm ? "Confirm booking" : "Complete all steps"}</button>
                <div className="summary-meta"><span><Shield size={14} /> Secure</span><span><MapPin size={14} /> Local business</span></div>
              </div>
            </div>

            <div className="history-card">
              <div className="history-card__header"><CalendarDays size={16} />Appointment history</div>
              {historyMessage.text ? <div className={`api-message history-message ${historyMessage.type || "info"}`}>{historyMessage.type === "error" ? <AlertCircle size={14} /> : <Check size={14} />}<span>{historyMessage.text}</span></div> : null}
              {appointmentsLoading ? <p>Loading history...</p> : null}
              {!appointmentsLoading && !appointments.length ? <p>No appointments yet.</p> : null}
              {!appointmentsLoading && appointments.length ? <div className="history-list">{appointments.slice(0, 5).map((item) => <div key={item._id} className="history-item"><div><strong>{item.service?.name || "Service"}</strong><span>{formatDisplayDate(item.appointmentDate)} at {item.startTime}</span><em className={`status status--${item.status}`}>{item.status}</em></div>{item.status !== "cancelled" ? <button className="history-cancel" type="button" onClick={() => handleCancel(item._id)}><XCircle size={14} />Cancel</button> : null}</div>)}</div> : null}
            </div>
          </aside>
        </section>
      </main>

      {showModal ? <div className="modal"><div className="modal__backdrop" onClick={() => setShowModal(false)} /><div className="modal__content" role="dialog" aria-modal="true"><div className="modal__icon"><Check size={28} /></div><h3>Booking confirmed</h3><p>Your appointment has been successfully scheduled.</p><div className="modal__summary"><div><strong>{lastCreatedAppointment?.service?.name || selectedService?.name}</strong><span>{formatDisplayDate(lastCreatedAppointment?.appointmentDate || selectedDate)} at {lastCreatedAppointment?.startTime || selectedTime || firstAvailableTime}</span></div></div><div className="modal__actions"><button type="button" className="ghost-btn" onClick={() => setShowModal(false)}>Close</button></div></div></div> : null}
    </div>
  );
}

export default App;
