import { useEffect, useState } from "react";
import { useAuth } from "../../../hooks/useAuth";
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  Globe,
  BarChart3,
  Network,
  ShieldCheck,
} from "lucide-react";

import "./LoginModal.css";

export default function LoginModal({ isOpen, onClose }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const {
    login,
    isLoading,
    error,
    setError,
  } = useAuth();

  useEffect(() => {
    if (!isOpen) return;

    const onKey = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isLogin = mode === "login";

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isLogin) {
      return;
    }

    const result = await login(email, password);

    if (result.success) {
      onClose();
    }
  };

  const switchMode = () => {
    setMode(isLogin ? "reset" : "login");
    setError(null);
  };

  return (
    <div className="login-page">
      <div className="login-card">

        {/* LEFT PANEL */}
        <section className="login-brand-panel">
          <div className="brand-overlay">

            <div className="brand-logo">
              <div className="brand-logo-mark">A</div>

              <div className="brand-logo-text">
                <h1>Urban Traffic</h1>
                <h2>Analytics</h2>
                <span>Traffic Dataset Management & Forecasting</span>
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

                <span>
                  Data-Driven
                  <br />
                  Insights
                </span>
              </div>

              <div className="brand-feature">
                <div className="feature-icon">
                  <Network size={22} />
                </div>

                <span>
                  Accurate
                  <br />
                  Forecasting
                </span>
              </div>

              <div className="brand-feature">
                <div className="feature-icon">
                  <ShieldCheck size={22} />
                </div>

                <span>
                  Safer & Smarter
                  <br />
                  Cities
                </span>
              </div>

            </div>
          </div>
        </section>

        {/* RIGHT PANEL */}
        <section className="login-form-panel">

          {/* LANGUAGE */}
          <div className="language-selector">
            <Globe size={16} />
            <span>English</span>
            <span className="language-arrow">⌄</span>
          </div>

          <div className="login-form-content">

            <h2>
              {isLogin ? "Welcome Back" : "Reset Password"}
            </h2>

            <p className="login-description">
              {isLogin
                ? "Sign in to access the Urban Traffic Analytics system."
                : "Enter your email and we will send you a reset link."}
            </p>

            <form onSubmit={handleSubmit}>

              {/* EMAIL */}
              <div className="form-group">

                <label htmlFor="auth-email">
                  Username
                </label>

                <div className="input-wrapper">
                  <Mail size={18} />

                  <input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your username"
                    required
                  />
                </div>

              </div>

              {/* PASSWORD */}
              {isLogin && (
                <div className="form-group">

                  <label htmlFor="auth-password">
                    Password
                  </label>

                  <div className="input-wrapper">

                    <Lock size={18} />

                    <input
                      id="auth-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                    />

                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() =>
                        setShowPassword(!showPassword)
                      }
                    >
                      {showPassword ? (
                        <EyeOff size={18} />
                      ) : (
                        <Eye size={18} />
                      )}
                    </button>

                  </div>

                </div>
              )}

              {/* REMEMBER + FORGOT */}
              {isLogin && (
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
                    onClick={switchMode}
                  >
                    Forgot password?
                  </button>

                </div>
              )}

              {/* ERROR */}
              {error && (
                <div className="login-error">
                  {error}
                </div>
              )}

              {/* SUBMIT */}
              <button
                id="auth-submit"
                type="submit"
                className="login-submit"
                disabled={isLoading}
              >
                {isLoading
                  ? "Đang đăng nhập..."
                  : isLogin
                    ? "Sign In"
                    : "Send Reset Link"}
              </button>

            </form>

            {/* BOTTOM */}
            <div className="login-footer">

              <span>
                Don't have an account?
              </span>

              <button
                type="button"
                onClick={() => {
                  // Sau này có thể mở Contact Admin
                }}
              >
                Contact your administrator.
              </button>

            </div>

          </div>
        </section>

      </div>
    </div>
  );
}