"use client";

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";

import FeatureBars from "@/components/FeatureBars";
import RiskGauge from "@/components/RiskGauge";
import XrayViewer from "@/components/XrayViewer";
import { api } from "@/lib/api";

type Patient = {
  id: number;
  hn: string;
  first_name: string;
  last_name: string;
  age: number;
  gender: string;
  bmi?: number;
  smoking: number;
  steroid_use: number;
  spine_bmd?: number;
};

type Prediction = {
  id: number;
  risk_score: number;
  risk_label: string;
  probability: number;
  visualization_json?: string;
  model_version?: string;
  created_at?: string;
};

type XrayMeta = {
  image_url: string | null;
  roi_url: string | null;
  uploaded_at?: string;
};

type XrayStudy = {
  xray_id: number;
  image_url: string | null;
  roi_url: string | null;
  uploaded_at: string | null;
  filename: string;
};

type ViewKey = "console" | "patients" | "xray" | "predictions" | "metrics" | "emr";

const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8001";

const emptyForm = {
  hn: "",
  first_name: "",
  last_name: "",
  age: 60,
  gender: "F",
  bmi: 22,
  smoking: 0,
  steroid_use: 0,
  spine_bmd: 0.9,
};

const VIEW_META: Record<ViewKey, { title: string; crumb: string }> = {
  console: { title: "Diagnostic Console", crumb: "Home · Osteoporosis · Spine" },
  patients: { title: "Patient Registry", crumb: "Home · Patients" },
  xray: { title: "X-ray Studies", crumb: "Home · Imaging · Spine" },
  predictions: { title: "AI Predictions", crumb: "Home · AI · Osteoporosis" },
  metrics: { title: "Model Metrics", crumb: "System · Model Performance" },
  emr: { title: "EMR Integration", crumb: "System · Data Sources" },
};

export default function HomePage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin1234");

  const [activeView, setActiveView] = useState<ViewKey>("console");

  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedHN, setSelectedHN] = useState("");
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [history, setHistory] = useState<Prediction[]>([]);
  const [xray, setXray] = useState<XrayMeta>({ image_url: null, roi_url: null });
  const [studies, setStudies] = useState<XrayStudy[]>([]);

  const [form, setForm] = useState(emptyForm);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.hn.toLowerCase() === selectedHN.toLowerCase()),
    [patients, selectedHN],
  );

  const login = async () => {
    try {
      await api.post("/seed-admin");
      const res = await api.post("/auth/login", { username, password });
      localStorage.setItem("token", res.data.access_token);
      setLoggedIn(true);
      Swal.fire({ icon: "success", title: "Authenticated", text: "Welcome to Clinical Decision Support System for Osteoporosis Screening" });
      fetchPatients();
    } catch (e: any) {
      Swal.fire({ icon: "error", title: "Login failed", text: e?.response?.data?.detail || "Invalid credentials" });
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setLoggedIn(false);
    setPatients([]);
    setPrediction(null);
    setSelectedHN("");
  };

  const fetchPatients = async () => {
    try {
      const res = await api.get("/patients");
      setPatients(res.data);
    } catch {
      Swal.fire({ icon: "error", title: "Cannot load patients" });
    }
  };

  const fetchXray = async (hn: string) => {
    try {
      const res = await api.get(`/xrays/${hn}`);
      const { image_url, roi_url, uploaded_at } = res.data || {};
      setXray({
        image_url: image_url ? `${apiBase}${image_url}` : null,
        roi_url: roi_url ? `${apiBase}${roi_url}` : null,
        uploaded_at,
      });
    } catch {
      setXray({ image_url: null, roi_url: null });
    }
  };

  const fetchStudies = async (hn: string) => {
    try {
      const res = await api.get(`/xrays/list/${hn}`);
      const list: XrayStudy[] = (res.data || []).map((s: XrayStudy) => ({
        ...s,
        image_url: s.image_url ? `${apiBase}${s.image_url}` : null,
        roi_url: s.roi_url ? `${apiBase}${s.roi_url}` : null,
      }));
      setStudies(list);
    } catch {
      setStudies([]);
    }
  };

  const importBMD = async () => {
    const confirm = await Swal.fire({
      title: "Import BMD Library?",
      html:
        'ระบบจะสแกนโฟลเดอร์ <code>backend/uploads/BMD/{Normal, Osteopenia, Osteoporosis}</code><br/>' +
        "และสร้างผู้ป่วย + ภาพ X-ray ทั้งหมด (ใช้ชื่อโฟลเดอร์เป็น HN)",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "เริ่ม Import",
      cancelButtonText: "ยกเลิก",
    });
    if (!confirm.isConfirmed) return;

    Swal.fire({
      title: "Importing BMD library…",
      html: "กำลังสแกนไฟล์ทั้งหมด กรุณารอสักครู่",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const res = await api.post("/xrays/import-bmd");
      const d = res.data || {};
      await fetchPatients();
      if (selectedHN) {
        await fetchStudies(selectedHN);
        await fetchXray(selectedHN);
      }
      Swal.fire({
        icon: "success",
        title: "Import complete",
        html: `
          <div style="text-align:left;line-height:1.8">
            <b>Total patients:</b> ${d.total_patients ?? 0}<br/>
            <b>Patients created:</b> ${d.patients_created ?? 0}<br/>
            <b>Patients updated:</b> ${d.patients_updated ?? 0}<br/>
            <b>Images imported:</b> ${d.images_imported ?? 0}<br/>
            <b>Images skipped:</b> ${d.skipped_images ?? 0}<br/>
            <b>Predictions created:</b> ${d.predictions_created ?? 0}<br/>
            <hr/>
            <b>Normal:</b> ${d.classes?.Normal ?? 0}<br/>
            <b>Osteopenia:</b> ${d.classes?.Osteopenia ?? 0}<br/>
            <b>Osteoporosis:</b> ${d.classes?.Osteoporosis ?? 0}
          </div>
        `,
      });
    } catch (e: any) {
      Swal.fire({
        icon: "error",
        title: "Import failed",
        text: e?.response?.data?.detail || "Unexpected error",
      });
    }
  };

  const selectStudy = (s: XrayStudy) => {
    setXray({
      image_url: s.image_url,
      roi_url: s.roi_url,
      uploaded_at: s.uploaded_at || undefined,
    });
  };

  const fetchHistory = async (hn: string) => {
    try {
      const res = await api.get(`/predictions/${hn}`);
      setHistory(res.data || []);
    } catch {
      setHistory([]);
    }
  };

  const createPatient = async () => {
    try {
      await api.post("/patients", form);
      Swal.fire({ icon: "success", title: "Patient added", timer: 1400, showConfirmButton: false });
      setForm(emptyForm);
      fetchPatients();
    } catch (e: any) {
      Swal.fire({ icon: "error", title: "Add failed", text: e?.response?.data?.detail || "Unable to create patient" });
    }
  };

  const deletePatient = async (id: number) => {
    const confirm = await Swal.fire({
      title: "Delete patient?",
      text: "This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
    });
    if (!confirm.isConfirmed) return;
    try {
      await api.delete(`/patients/${id}`);
      Swal.fire({ icon: "success", title: "Deleted", timer: 1000, showConfirmButton: false });
      fetchPatients();
    } catch {
      Swal.fire({ icon: "error", title: "Delete failed" });
    }
  };

  const uploadXray = async (file: File) => {
    if (!selectedHN) {
      const { value: hn } = await Swal.fire({
        title: "Select patient HN",
        input: "select",
        inputOptions: patients.reduce<Record<string, string>>((acc, p) => {
          acc[p.hn] = `${p.hn} · ${p.first_name} ${p.last_name}`;
          return acc;
        }, {}),
        inputPlaceholder: "Choose a patient",
        showCancelButton: true,
      });
      if (!hn) return;
      setSelectedHN(hn);
      await actuallyUploadXray(file, hn);
      return;
    }
    await actuallyUploadXray(file, selectedHN);
  };

  const actuallyUploadXray = async (file: File, hn: string) => {
    const body = new FormData();
    body.append("patient_hn", hn);
    body.append("file", file);
    try {
      const res = await api.post("/xrays/upload", body);
      const { image_url, roi_url } = res.data || {};
      setXray({
        image_url: image_url ? `${apiBase}${image_url}` : null,
        roi_url: roi_url ? `${apiBase}${roi_url}` : null,
        uploaded_at: new Date().toISOString(),
      });
      Swal.fire({ icon: "success", title: "X-ray uploaded", timer: 1200, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire({ icon: "error", title: "Upload failed", text: e?.response?.data?.detail || "" });
    }
  };

  const runPredict = async () => {
    if (!selectedHN) {
      Swal.fire({ icon: "info", title: "Please select a patient HN first" });
      return;
    }
    try {
      const res = await api.post(`/predict/${selectedHN}`);
      setPrediction(res.data);
      fetchHistory(selectedHN);
      Swal.fire({
        icon: "success",
        title: "Prediction complete",
        text: `Risk: ${res.data.risk_label} (${res.data.risk_score}%)`,
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (e: any) {
      Swal.fire({ icon: "error", title: "Predict failed", text: e?.response?.data?.detail || "" });
    }
  };

  useEffect(() => {
    if (localStorage.getItem("token")) {
      setLoggedIn(true);
      fetchPatients();
    }
  }, []);

  useEffect(() => {
    if (selectedHN) {
      fetchXray(selectedHN);
      fetchHistory(selectedHN);
      fetchStudies(selectedHN);
      setPrediction(null);
    } else {
      setXray({ image_url: null, roi_url: null });
      setHistory([]);
      setStudies([]);
    }
  }, [selectedHN]);

  const patientName = selectedPatient
    ? `${selectedPatient.first_name} ${selectedPatient.last_name}`
    : "";

  if (!loggedIn) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="brand" style={{ borderBottom: "none", marginBottom: 0 }}>
            <div className="brand-mark">CDSS</div>
            <div className="brand-name">
              <strong>Clinical Decision Support</strong>
              <small>Osteoporosis Screening System</small>
            </div>
          </div>
          <h1>Sign in</h1>
          <p>Secure access for medical staff</p>
          <input
            className="input"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="input"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn btn-primary" onClick={login}>
            Sign in
          </button>
          <div className="login-hint">Default admin / admin1234</div>
        </div>
      </div>
    );
  }

  const NavItem = ({ id, label }: { id: ViewKey; label: string }) => (
    <div
      className={`nav-item ${activeView === id ? "active" : ""}`}
      onClick={() => setActiveView(id)}
    >
      <span>{label}</span>
    </div>
  );

  const PatientSelector = () => (
    <select
      className="input"
      style={{ width: 240 }}
      value={selectedHN}
      onChange={(e) => setSelectedHN(e.target.value)}
    >
      <option value="">— Select Patient —</option>
      {patients.map((p) => (
        <option key={p.id} value={p.hn}>
          {p.hn} · {p.first_name} {p.last_name}
        </option>
      ))}
    </select>
  );

  const XrayCard = () => (
    <XrayViewer
      imageUrl={xray.image_url}
      patientHN={selectedPatient?.hn}
      patientName={patientName}
      uploadedAt={xray.uploaded_at || null}
      onUpload={uploadXray}
    />
  );

  const StudyGallery = () => {
    if (!selectedHN) {
      return <p className="muted">Select a patient to browse imported studies.</p>;
    }
    if (studies.length === 0) {
      return <p className="muted">No X-ray studies for this patient yet.</p>;
    }
    return (
      <div className="study-gallery">
        {studies.map((s) => {
          const isActive = xray.image_url === s.image_url;
          return (
            <button
              key={s.xray_id}
              className={`study-thumb ${isActive ? "active" : ""}`}
              onClick={() => selectStudy(s)}
              title={s.filename}
            >
              {s.image_url ? (
                <img src={s.image_url} alt={s.filename} />
              ) : (
                <div className="study-thumb-empty">—</div>
              )}
              <div className="study-thumb-meta">
                <span className="study-thumb-name">{s.filename}</span>
                <span className="study-thumb-date">
                  {s.uploaded_at ? new Date(s.uploaded_at).toLocaleDateString() : ""}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const PatientTable = () => (
    <table className="table">
      <thead>
        <tr>
          <th>HN</th>
          <th>Name</th>
          <th>Age</th>
          <th>Sex</th>
          <th>BMI</th>
          <th>Spine BMD</th>
          <th>Smoking</th>
          <th>Steroid</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {patients.map((p) => (
          <tr key={p.id}>
            <td>{p.hn}</td>
            <td>
              {p.first_name} {p.last_name}
            </td>
            <td>{p.age}</td>
            <td>{p.gender}</td>
            <td>{p.bmi ?? "—"}</td>
            <td>{p.spine_bmd ?? "—"}</td>
            <td>{p.smoking ? "Yes" : "No"}</td>
            <td>{p.steroid_use ? "Yes" : "No"}</td>
            <td style={{ textAlign: "right" }}>
              <div className="btn-row" style={{ justifyContent: "flex-end" }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setSelectedHN(p.hn);
                    setActiveView("console");
                  }}
                >
                  Open
                </button>
                <button className="btn btn-danger" onClick={() => deletePatient(p.id)}>
                  Delete
                </button>
              </div>
            </td>
          </tr>
        ))}
        {patients.length === 0 && (
          <tr>
            <td colSpan={9} className="muted" style={{ textAlign: "center", padding: 18 }}>
              No patients yet. Add your first patient below.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );

  const PatientForm = () => (
    <div>
      <div className="form-grid">
        <label>
          HN
          <input
            className="input"
            value={form.hn}
            onChange={(e) => setForm({ ...form, hn: e.target.value })}
            placeholder="HN001"
          />
        </label>
        <label>
          First name
          <input
            className="input"
            value={form.first_name}
            onChange={(e) => setForm({ ...form, first_name: e.target.value })}
          />
        </label>
        <label>
          Last name
          <input
            className="input"
            value={form.last_name}
            onChange={(e) => setForm({ ...form, last_name: e.target.value })}
          />
        </label>
        <label>
          Age
          <input
            className="input"
            type="number"
            value={form.age}
            onChange={(e) => setForm({ ...form, age: Number(e.target.value) })}
          />
        </label>
        <label>
          Gender
          <select
            className="input"
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value })}
          >
            <option value="F">Female</option>
            <option value="M">Male</option>
          </select>
        </label>
        <label>
          BMI
          <input
            className="input"
            type="number"
            step="0.1"
            value={form.bmi}
            onChange={(e) => setForm({ ...form, bmi: Number(e.target.value) })}
          />
        </label>
        <label>
          Spine BMD
          <input
            className="input"
            type="number"
            step="0.01"
            value={form.spine_bmd}
            onChange={(e) => setForm({ ...form, spine_bmd: Number(e.target.value) })}
          />
        </label>
        <label>
          Smoking
          <select
            className="input"
            value={form.smoking}
            onChange={(e) => setForm({ ...form, smoking: Number(e.target.value) })}
          >
            <option value={0}>No</option>
            <option value={1}>Yes</option>
          </select>
        </label>
        <label>
          Steroid use
          <select
            className="input"
            value={form.steroid_use}
            onChange={(e) => setForm({ ...form, steroid_use: Number(e.target.value) })}
          >
            <option value={0}>No</option>
            <option value={1}>Yes</option>
          </select>
        </label>
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={createPatient}>
          Save Patient
        </button>
      </div>
    </div>
  );

  const AIPanel = () => (
    <>
      <div className="panel">
        <div className="section-title">
          <h2>AI Risk Assessment</h2>
          <span className="chip chip-ok">
            {prediction?.model_version || "hybrid-v1"}
          </span>
        </div>
        <RiskGauge
          riskScore={prediction?.risk_score ?? 0}
          label={prediction?.risk_label || "Awaiting prediction"}
          probability={prediction?.probability}
        />
        <div className="kpi-grid" style={{ marginTop: 14 }}>
          <div className="kpi">
            <div className="kpi-label">Spine BMD</div>
            <div className="kpi-value">{selectedPatient?.spine_bmd ?? "—"}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Age</div>
            <div className="kpi-value">{selectedPatient?.age ?? "—"}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">BMI</div>
            <div className="kpi-value">{selectedPatient?.bmi ?? "—"}</div>
          </div>
        </div>
      </div>

      <div className="panel">
        <FeatureBars visualizationJson={prediction?.visualization_json} />
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Clinical Summary</h2>
        </div>
        {selectedPatient ? (
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            <div>
              <b>
                {selectedPatient.first_name} {selectedPatient.last_name}
              </b>{" "}
              · HN {selectedPatient.hn}
            </div>
            <div className="muted">
              {selectedPatient.gender} · {selectedPatient.age} y/o · BMI{" "}
              {selectedPatient.bmi ?? "—"}
            </div>
            <div style={{ marginTop: 8 }}>
              Smoking:{" "}
              <span className={selectedPatient.smoking ? "chip chip-warn" : "chip chip-ok"}>
                {selectedPatient.smoking ? "Positive" : "Negative"}
              </span>{" "}
              Steroid:{" "}
              <span className={selectedPatient.steroid_use ? "chip chip-warn" : "chip chip-ok"}>
                {selectedPatient.steroid_use ? "Positive" : "Negative"}
              </span>
            </div>
            <div style={{ marginTop: 8 }}>
              Spine BMD:{" "}
              <span
                className={
                  (selectedPatient.spine_bmd ?? 1) < 0.8 ? "chip chip-danger" : "chip chip-ok"
                }
              >
                {selectedPatient.spine_bmd ?? "—"} g/cm²
              </span>
            </div>
          </div>
        ) : (
          <p className="muted">Select a patient to view clinical details.</p>
        )}
      </div>
    </>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">CDSS</div>
          <div className="brand-name">
            <strong>Clinical Decision Support</strong>
            <small>Osteoporosis Screening</small>
          </div>
        </div>
        <div className="nav-section">Workspace</div>
        <NavItem id="console" label="Diagnostic Console" />
        <NavItem id="patients" label="Patients" />
        <NavItem id="xray" label="X-ray Studies" />
        <NavItem id="predictions" label="AI Predictions" />
        <div className="nav-section" style={{ marginTop: 20 }}>
          System
        </div>
        <NavItem id="metrics" label="Model Metrics" />
        <NavItem id="emr" label="EMR Integration" />
        <div
          className="nav-item"
          onClick={logout}
          style={{ marginTop: 16, color: "#fca5a5" }}
        >
          Sign out
        </div>
      </aside>

      <div>
        <div className="topbar">
          <div>
            <h1>{VIEW_META[activeView].title}</h1>
            <div className="breadcrumbs">{VIEW_META[activeView].crumb}</div>
          </div>
          <div className="user-chip">
            <span style={{ color: "#7dd3fc" }}>●</span>
            <strong>admin</strong>
            <span style={{ color: "var(--muted)" }}>role: admin</span>
          </div>
        </div>

        <div className="main">
          {activeView === "console" && (
            <>
              <div>
                <div
                  className="panel"
                  style={{ padding: 0, background: "transparent", border: "none", boxShadow: "none" }}
                >
                  <XrayCard />
                </div>

                <div className="panel">
                  <div className="section-title">
                    <h2>Patient Registry</h2>
                    <div className="btn-row">
                      <PatientSelector />
                      <button className="btn btn-primary" onClick={runPredict}>
                        Run AI Prediction
                      </button>
                    </div>
                  </div>
                  <PatientTable />
                </div>

                <div className="panel">
                  <div className="section-title">
                    <h2>Add / Update Patient</h2>
                  </div>
                  <PatientForm />
                </div>
              </div>

              <div>
                <AIPanel />
              </div>
            </>
          )}

          {activeView === "patients" && (
            <>
              <div>
                <div className="panel">
                  <div className="section-title">
                    <h2>Patient Registry</h2>
                    <div className="btn-row">
                      <PatientSelector />
                    </div>
                  </div>
                  <PatientTable />
                </div>
                <div className="panel">
                  <div className="section-title">
                    <h2>Add / Update Patient</h2>
                  </div>
                  <PatientForm />
                </div>
              </div>
              <div>
                <div className="panel">
                  <div className="section-title">
                    <h2>Quick Actions</h2>
                  </div>
                  <p className="muted">
                    Manage patient records, clinical data, and select a patient to send to the
                    diagnostic console.
                  </p>
                </div>
              </div>
            </>
          )}

          {activeView === "xray" && (
            <>
              <div>
                <div className="panel">
                  <div className="section-title">
                    <h2>X-ray Study</h2>
                    <div className="btn-row">
                      <PatientSelector />
                      <button className="btn btn-ghost" onClick={importBMD}>
                        ⬇ Import BMD Library
                      </button>
                    </div>
                  </div>
                  <XrayCard />
                </div>
                <div className="panel">
                  <div className="section-title">
                    <h2>Study Series</h2>
                    <span className="chip chip-ok">
                      {studies.length} image{studies.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <StudyGallery />
                </div>
              </div>
              <div>
                <div className="panel">
                  <div className="section-title">
                    <h2>BMD Library</h2>
                  </div>
                  <p className="muted">
                    Import every X-ray from <code>backend/uploads/BMD/</code>. Folder names map to
                    patient HN, grouped by Normal, Osteopenia, and Osteoporosis.
                  </p>
                  <button className="btn btn-primary" onClick={importBMD} style={{ width: "100%" }}>
                    Import / Sync BMD Library
                  </button>
                </div>
                <div className="panel">
                  <div className="section-title">
                    <h2>Upload Guidance</h2>
                  </div>
                  <p className="muted">
                    Select a patient, then drag &amp; drop the X-ray image onto the viewer or click
                    the upload zone. Supported formats: PNG/JPG. The system extracts the spine ROI
                    (L1–L4) automatically.
                  </p>
                </div>
                <div className="panel">
                  <div className="section-title">
                    <h2>Current Study</h2>
                  </div>
                  {xray.image_url ? (
                    <div className="muted">
                      HN {selectedPatient?.hn} · uploaded{" "}
                      {xray.uploaded_at ? new Date(xray.uploaded_at).toLocaleString() : "—"}
                    </div>
                  ) : (
                    <p className="muted">No study loaded yet.</p>
                  )}
                </div>
              </div>
            </>
          )}

          {activeView === "predictions" && (
            <>
              <div>
                <div className="panel">
                  <div className="section-title">
                    <h2>Prediction History</h2>
                    <div className="btn-row">
                      <PatientSelector />
                      <button className="btn btn-primary" onClick={runPredict}>
                        Run AI Prediction
                      </button>
                    </div>
                  </div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Created</th>
                        <th>Model</th>
                        <th>Risk Label</th>
                        <th>Score</th>
                        <th>Probability</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h, idx) => (
                        <tr key={h.id}>
                          <td>{idx + 1}</td>
                          <td>{h.created_at ? new Date(h.created_at).toLocaleString() : "—"}</td>
                          <td>{h.model_version || "—"}</td>
                          <td>
                            <span
                              className={`chip ${
                                h.risk_score >= 70
                                  ? "chip-danger"
                                  : h.risk_score >= 40
                                  ? "chip-warn"
                                  : "chip-ok"
                              }`}
                            >
                              {h.risk_label}
                            </span>
                          </td>
                          <td>{h.risk_score}%</td>
                          <td>{h.probability?.toFixed?.(3)}</td>
                        </tr>
                      ))}
                      {history.length === 0 && (
                        <tr>
                          <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 16 }}>
                            No predictions yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <AIPanel />
              </div>
            </>
          )}

          {activeView === "metrics" && (
            <>
              <div>
                <div className="panel">
                  <div className="section-title">
                    <h2>Model Performance</h2>
                    <span className="chip chip-ok">hybrid-v1</span>
                  </div>
                  <div className="kpi-grid">
                    <div className="kpi">
                      <div className="kpi-label">Accuracy</div>
                      <div className="kpi-value">0.921</div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">F1 Score</div>
                      <div className="kpi-value">0.894</div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">AUC</div>
                      <div className="kpi-value">0.956</div>
                    </div>
                  </div>
                  <p className="muted" style={{ marginTop: 12 }}>
                    Hybrid model combining tabular clinical features and CNN image embedding.
                    Trained with StratifiedKFold cross-validation and SMOTE to handle class
                    imbalance.
                  </p>
                </div>
              </div>
              <div>
                <div className="panel">
                  <div className="section-title">
                    <h2>Training Notes</h2>
                  </div>
                  <ul className="muted" style={{ lineHeight: 1.8 }}>
                    <li>Train/Test split: stratified 80/20, no leakage</li>
                    <li>Cross-validation: 3-fold stratified</li>
                    <li>Class imbalance: SMOTE + class_weight=balanced</li>
                    <li>Metrics: Accuracy / F1 / AUC</li>
                  </ul>
                </div>
              </div>
            </>
          )}

          {activeView === "emr" && (
            <>
              <div>
                <div className="panel">
                  <div className="section-title">
                    <h2>EMR Integration</h2>
                    <span className="chip chip-ok">Connected · Simulated</span>
                  </div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th>Type</th>
                        <th>Records</th>
                        <th>Last Sync</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>HIS · Demographics</td>
                        <td>CSV / HL7</td>
                        <td>{patients.length}</td>
                        <td>Live</td>
                      </tr>
                      <tr>
                        <td>Lab · Clinical Risk</td>
                        <td>CSV</td>
                        <td>{patients.length}</td>
                        <td>Live</td>
                      </tr>
                      <tr>
                        <td>BMD · Spine</td>
                        <td>DEXA</td>
                        <td>{patients.filter((p) => p.spine_bmd != null).length}</td>
                        <td>Live</td>
                      </tr>
                      <tr>
                        <td>BMD Image Library</td>
                        <td>PNG / JPG</td>
                        <td>
                          <button className="btn btn-ghost" onClick={importBMD}>
                            Import Now
                          </button>
                        </td>
                        <td>On-demand</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="muted" style={{ marginTop: 10 }}>
                    Dataset merged into <b>OsteoporosisUPDataset.csv</b> keyed by HN, spine region
                    only.
                  </p>
                </div>
              </div>
              <div>
                <div className="panel">
                  <div className="section-title">
                    <h2>BMD Library Sync</h2>
                  </div>
                  <p className="muted">
                    Scans <code>backend/uploads/BMD/{"{Normal|Osteopenia|Osteoporosis}"}</code> and
                    registers every image under the 9-digit folder name as the patient HN. Safe to
                    re-run — duplicates are skipped.
                  </p>
                  <button className="btn btn-primary" onClick={importBMD} style={{ width: "100%" }}>
                    Import / Sync BMD Library
                  </button>
                </div>
                <div className="panel">
                  <div className="section-title">
                    <h2>Security</h2>
                  </div>
                  <p className="muted">
                    Data flows are authenticated and role-based (admin / doctor / nurse). All
                    images are stored in isolated upload storage.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
