export default function Loader({ label = "Loading..." }) {
  return (
    <div className="center-state">
      <div className="glass-card compact-card">
        <div className="spinner" />
        <p>{label}</p>
      </div>
    </div>
  );
}