import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="center-state">
      <div className="glass-card compact-card">
        <h2>Page not found</h2>
        <p>The route you requested does not exist.</p>
        <Link className="primary-button inline-button" to="/login">
          Go to login
        </Link>
      </div>
    </div>
  );
}