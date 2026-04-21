import { useEffect, useState } from "react";
import { getAvailableWorkersRequest } from "../../api/workerApi";
import StatusBadge from "../ui/StatusBadge";

export default function WorkerSelectModal({ jobId, onSelect, onClose }) {
  const [workers, setWorkers] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [form, setForm] = useState({
    workerOfferedAmount: "",
    platformRetentionRate: 20,
    adminQuoteNotes: ""
  });
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getAvailableWorkersRequest(jobId);
        setWorkers(res.data || []);
      } catch (err) {
        setError(err?.response?.data?.message || "Failed to load available workers.");
      }
    };

    load();
  }, [jobId]);

  const handleChange = (event) => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value
    }));
  };

  const handleSubmit = () => {
    if (!selectedWorkerId) {
      setError("Please select a worker first.");
      return;
    }

    if (!form.workerOfferedAmount) {
      setError("Worker offer is required.");
      return;
    }

    onSelect(selectedWorkerId, {
      workerOfferedAmount: Number(form.workerOfferedAmount),
      platformRetentionRate: Number(form.platformRetentionRate || 20),
      adminQuoteNotes: form.adminQuoteNotes
    });
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card glass-card" style={{background:"rgba(15,23,42,0.95)", border:"1px solid rgba(148,163,184,0.25)"}}>
        <div className="section-head">
          <div>
            <h3>Select Worker and Confirm Dispatch</h3>
            <p>Only jobs accepted by client can be dispatched.</p>
          </div>
          <button className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>

        {error ? <div className="error-banner">{error}</div> : null}

        <div className="form-grid">
          <label className="field">
            <span style={{color:"#e2e8f0",fontWeight:600}}>Worker Offer (KES)</span>
            <input
              type="number"
              name="workerOfferedAmount"
              value={form.workerOfferedAmount}
              onChange={handleChange}
              placeholder="e.g. 1600"
            />
          </label>

          <label className="field">
            <span style={{color:"#e2e8f0",fontWeight:600}}>Platform Retention (%)</span>
            <input
              type="number"
              name="platformRetentionRate"
              value={form.platformRetentionRate}
              onChange={handleChange}
            />
          </label>

          <label className="field field-span-2">
            <span style={{color:"#e2e8f0",fontWeight:600}}>Admin Dispatch Notes</span>
            <textarea
              name="adminQuoteNotes"
              rows="3"
              value={form.adminQuoteNotes}
              onChange={handleChange}
              placeholder="Dispatch or worker-offer notes"
            />
          </label>
        </div>

        <div className="card-stack modal-worker-list">
          {workers.length === 0 ? (
            <p>No available workers currently match this job.</p>
          ) : (
            workers.map((worker) => (
              <button
                key={worker._id}
                type="button"
                className={`worker-pick-card ${selectedWorkerId === worker.userId?._id ? "selected-worker" : ""}`} style={{border:selectedWorkerId === worker.userId?._id ? "2px solid #38bdf8" : "1px solid rgba(148,163,184,0.2)", background:selectedWorkerId === worker.userId?._id ? "rgba(56,189,248,0.08)" : ""}}
                onClick={() => setSelectedWorkerId(worker.userId?._id)}
              >
                <div className="job-head">
                  <div>
                    <h4 style={{fontSize:"18px",fontWeight:700,color:"#f8fafc"}}>{worker.userId?.fullName || "Worker"}</h4>
                    <p>
                      {worker.currentLocation?.estate || worker.homeLocation?.estate || "-"} •{" "}
                      {worker.currentLocation?.town || worker.homeLocation?.town || "-"}
                    </p>
                  </div>

                  <div className="badge-row">
                    <StatusBadge value={worker.availability?.status || "offline"} />
                    <StatusBadge value={worker.priorityLabel || "available"} />
                  </div>
                </div>

                <div className="details-grid">
                  <div style={{color:"#cbd5f5"}}><strong style={{color:"#e2e8f0"}}>Phone:</strong> {worker.userId?.phone || "-"}</div>
                  <div style={{color:"#cbd5f5"}}><strong style={{color:"#e2e8f0"}}>Experience:</strong> {worker.yearsOfExperience || 0} yrs</div>
                  <div style={{color:"#cbd5f5"}}><strong style={{color:"#e2e8f0"}}>Services:</strong> {(worker.serviceCategories || []).join(", ")}</div>
                  <div style={{color:"#cbd5f5"}}><strong style={{color:"#e2e8f0"}}>Score:</strong> {worker.rankingScore ?? 0}</div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="action-row">
          <button className="primary-button" onClick={handleSubmit}>
            Confirm Assignment
          </button>
        </div>
      </div>
    </div>
  );
}




