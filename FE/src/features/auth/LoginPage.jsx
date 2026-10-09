
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  BarChart3,
  Network,
  ShieldCheck,
  Globe,
} from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import "./LoginPage.css";

export default function LoginPage() {
  const navigate = useNavigate();

  const {
    login,
    isLoading,
    error,
    setError,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const result = await login(email, password);

    if (result.success) {
      // TODO: Thay bằng route Dashboard theo role
      navigate("/");
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">

        {/* Left: Branding */}
        <section className="login-brand-panel">
          <div className="brand-overlay">
            <div className="brand-logo">
              <div className="brand-logo-mark">A</div>

              <div>
                <h1>Urban Traffic</h1>
                <h2>Analytics</h2>
                <span>
                  Traffic Dataset Management & Forecasting
                </span>
              </div>
            </div>

            <div className="brand-content">
              <h3>
                Smarter Traffic
                <br />
                for a Better Tomorrow
              </h3>

              <p>
                Analyze real traffic data, discover patterns,
                and forecast future trends to build smarter
                and more sustainable cities.
              </p>
            </div>

            <div className="brand-features">
              <div className="brand-feature">
                <div className="feature-icon">
                  <BarChart3 size={22} />
                </div>
                <span>Data-Driven<br />Insights</span>
              </div>

              <div className="brand-feature">
                <div className="feature-icon">
                  <Network size={22} />
                </div>
                <span>Accurate<br />Forecasting</span>
              </div>

              <div className="brand-feature">
                <div className="feature-icon">
                  <ShieldCheck size={22} />
                </div>
                <span>Safer & Smarter<br />Cities</span>
              </div>
            </div>
          </div>
        </section>

        {/* Right: Login form */}
        <section className="login-form-panel">
          {/* <div className="language-selector">
            <Globe size={16} />
            <span>English</span>
            <span className="language-arrow">⌄</span>
          </div> */}
            <button
              type="button"
              className="login-back-home"
              onClick={() => navigate("/")}
            >
              ← Back to Home
            </button>
          <div className="login-form-content">
            <h2>Welcome Back</h2>

            <p className="login-description">
              Sign in to access the Urban Traffic Analytics system.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="auth-email">Email</label>

                <div className="input-wrapper">
                  <Mail size={18} />

                  <input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="auth-password">Password</label>

                <div className="input-wrapper">
                  <Lock size={18} />

                  <input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                  />

                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    {showPassword
                      ? <EyeOff size={18} />
                      : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="login-options">
                <label className="remember-me">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) =>
                      setRememberMe(e.target.checked)
                    }
                  />
                  <span>Remember me</span>
                </label>

                <button
                  type="button"
                  className="forgot-password"
                  onClick={() => {
                    // TODO: Implement forgot-password flow
                  }}
                >
                  Forgot password?
                </button>
              </div>

              {error && (
                <p className="login-error" role="alert">
                  {error}
                </p>
              )}

              <button
                id="auth-submit"
                type="submit"
                className="login-submit"
                disabled={isLoading}
              >
                {isLoading ? "Đang đăng nhập..." : "Sign In"}
              </button>
            </form>

            {/* <div className="login-footer">
              <span>Don't have an account?</span>
              <button
                type="button"
                onClick={() => {
                  // Tài khoản được quản lý bởi Administrator
                }}
              >
                Register now
              </button>
            </div> */}
          </div>
        </section>
      </div>
    </div>
  );
}