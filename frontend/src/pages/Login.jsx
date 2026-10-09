import { useState } from "react";
import { Eye, EyeOff, LockKeyhole, User } from "lucide-react";
import "./Login.css";

function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch("http://localhost:5000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Login failed.");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      onLogin(data.user);
    } catch (err) {
      setError(err.message || "Unable to login.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="loginPage">
      <div className="loginIndustrialBackdrop" aria-hidden="true">
        <div className="loginSteelFrame">
          <span /><span /><span /><span />
        </div>
      </div>
      <section className="loginPanel">
        <div className="loginBrand">
          <div className="loginBrandMark">S</div>

          <div>
            <h1>ST★RLIT</h1>
            <span>STEEL SYSTEMS</span>
          </div>
        </div>

        <div className="loginHeading">
          <span>PRODUCTION MANAGEMENT SYSTEM</span>
          <h2>Welcome Back</h2>
          <p>Sign in to access the production workspace.</p>
        </div>

        <form onSubmit={handleSubmit} className="loginForm">
          <label>
            USERNAME

            <div className="loginInput">
              <User size={18} />

              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Enter username"
                autoComplete="username"
              />
            </div>
          </label>

          <label>
            PASSWORD

            <div className="loginInput loginPasswordInput">
              <LockKeyhole size={18} />

              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="loginPasswordToggle"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          {error && <div className="loginError">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? "SIGNING IN..." : "LOGIN"}
          </button>
        </form>

        <div className="loginFooter">
          ST★RLIT STEEL BUILDING SOLUTION
        </div>
      </section>
    </main>
  );
}

export default Login;
