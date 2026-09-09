import React from "preact/compat";
import NativeDialog from "../../components/NativeDialog.js";
import { _ } from "../../js/i18n.js";
import "./LoginModal.css";

export class LoginModal extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      username: "",
      password: "",
      submitted: false,
    };
    this.usernameInputRef = React.createRef();
    this.passwordInputRef = React.createRef();
    this.submitBtnRef = React.createRef();
    this.formRef = React.createRef();
  }

  componentDidMount() {
    if (this.props.show) {
      this.attemptAutoRetrieve();
      this.focusAppropriateField();
    }
  }

  componentDidUpdate(prevProps) {
    if (this.props.show && !prevProps.show) {
      this.setState({ username: "", password: "", submitted: false });
      this.attemptAutoRetrieve();
      this.focusAppropriateField();
    }
  }

  focusAppropriateField() {
    setTimeout(() => {
      const u = (this.state.username || this.usernameInputRef.current?.value || "").trim();
      const p = this.state.password || this.passwordInputRef.current?.value || "";
      if (u && p && this.submitBtnRef.current) {
        this.submitBtnRef.current.focus();
      } else if (u && this.passwordInputRef.current) {
        this.passwordInputRef.current.focus();
      } else if (this.usernameInputRef.current) {
        this.usernameInputRef.current.focus();
      }
    }, 100);
  }

  attemptAutoRetrieve = async (isUserGesture = false) => {
    if (
      typeof window === "undefined" ||
      !window.PasswordCredential ||
      !navigator?.credentials?.get
    ) {
      return;
    }

    try {
      // 1. Attempt silent retrieval (frictionless auto-fill if single credential exists and allowed)
      let cred = await navigator.credentials.get({
        password: true,
        mediation: "silent",
      });

      // 2. If silent returned null and we have a user gesture context, attempt optional
      if (!cred && isUserGesture) {
        try {
          cred = await navigator.credentials.get({
            password: true,
            mediation: "optional",
          });
        } catch (e) {}
      }

      if (cred && cred.id) {
        this.setState(
          {
            username: cred.id,
            password: cred.password || "",
          },
          () => {
            this.focusAppropriateField();
          }
        );
      }
    } catch (err) {
      // Gracefully ignore if browser blocks credential retrieval
    }
  };

  handleUsernameChange = (e) => {
    this.setState({ username: e.target.value });
  };

  handlePasswordChange = (e) => {
    this.setState({ password: e.target.value });
  };

  handleSubmit = (e) => {
    const { username, password } = this.state;
    const trimmedId = (username || this.usernameInputRef.current?.value || "").trim();
    const effectivePassword = password || this.passwordInputRef.current?.value || "";
    if (!trimmedId) {
      e?.preventDefault?.();
      return;
    }

    // Do not call e.preventDefault() so WebKit/Safari detects an uncancelled native form submission
    // directed into the hidden target iframe, allowing iCloud Keychain to trigger the save password prompt.

    this.setState({ submitted: true });

    // Soft navigation state transition for WebKit password manager heuristics
    if (typeof window !== "undefined" && window.history?.replaceState) {
      try {
        window.history.replaceState(
          window.history.state,
          document.title,
          window.location.href
        );
      } catch (err) {}
    }

    // Explicitly request browser credential store (Credential Management API for SPAs)
    if (
      typeof window !== "undefined" &&
      window.PasswordCredential &&
      navigator?.credentials?.store
    ) {
      try {
        let cred = null;
        if (this.formRef.current) {
          try {
            cred = new window.PasswordCredential(this.formRef.current);
          } catch (err) {}
        }
        if (!cred) {
          cred = new window.PasswordCredential({
            id: trimmedId,
            password: effectivePassword,
          });
        }
        navigator.credentials.store(cred).catch(() => {});
      } catch (err) {}
    }

    if (this.props.onLogin) {
      this.props.onLogin({
        username: trimmedId,
        password: effectivePassword,
      });
    }
  };

  handleClose = (e) => {
    e?.preventDefault?.();
    this.setState({ username: "", password: "", submitted: false });
    if (this.props.onHide) {
      this.props.onHide();
    }
  };

  render() {
    const { show } = this.props;
    const { username, password, submitted } = this.state;

    return (
      <NativeDialog
        open={show}
        onClose={this.handleClose}
        className="LoginModal native-modal"
      >
        <iframe
          name="ptt_auth_target_frame"
          id="ptt_auth_target_frame"
          style={{ display: "none", width: 0, height: 0, border: 0 }}
          tabIndex={-1}
          aria-hidden="true"
        />
        <form
          ref={this.formRef}
          className="LoginModal__Form"
          method="post"
          action="#"
          target="ptt_auth_target_frame"
          onSubmit={this.handleSubmit}
          autoComplete="on"
        >
          <div className="LoginModal__Header">
            <div className="LoginModal__TitleGroup">
              <svg
                className="LoginModal__TitleIcon"
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
              </svg>
              <h3 className="LoginModal__Title">
                {_("login_modal_title")}
              </h3>
            </div>
            <button
              type="button"
              className="LoginModal__CloseBtn"
              onClick={this.handleClose}
              aria-label="Close"
            >
              &times;
            </button>
          </div>

          <div className="LoginModal__Body">
            <p className="LoginModal__Hint">
              {_("login_modal_desc")}
            </p>

            <div className="form-group LoginModal__Field">
              <label htmlFor="ptt-login-username">
                {_("login_modal_username")}
              </label>
              <input
                ref={this.usernameInputRef}
                id="ptt-login-username"
                name="username"
                type="text"
                className="form-control LoginModal__Input"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                placeholder={_("login_modal_username_placeholder")}
                value={username}
                onInput={this.handleUsernameChange}
                onChange={this.handleUsernameChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    this.passwordInputRef.current?.focus();
                  }
                }}
                onClick={() => {
                  if (!this.state.username) this.attemptAutoRetrieve(true);
                }}
                required
                disabled={submitted}
              />
            </div>

            <div className="form-group LoginModal__Field">
              <label htmlFor="ptt-login-password">
                {_("login_modal_password")}
              </label>
              <input
                ref={this.passwordInputRef}
                id="ptt-login-password"
                name="password"
                type="password"
                className="form-control LoginModal__Input"
                autoComplete="current-password"
                enterKeyHint="go"
                placeholder={_("login_modal_password_placeholder")}
                value={password}
                onInput={this.handlePasswordChange}
                onChange={this.handlePasswordChange}
                onClick={() => {
                  if (!this.state.username) this.attemptAutoRetrieve(true);
                }}
                required
                disabled={submitted}
              />
            </div>
          </div>

          <div className="LoginModal__Footer">
            <button
              type="button"
              className="btn btn-default LoginModal__Btn LoginModal__Btn--cancel"
              onClick={this.handleClose}
              disabled={submitted}
            >
              {_("login_modal_cancel")}
            </button>
            <button
              ref={this.submitBtnRef}
              type="submit"
              className="btn btn-primary LoginModal__Btn LoginModal__Btn--submit"
              disabled={submitted || !(username || this.usernameInputRef.current?.value || "").trim()}
            >
              {submitted
                ? _("login_modal_logging_in")
                : _("login_modal_submit")}
            </button>
          </div>
        </form>
      </NativeDialog>
    );
  }
}

export default LoginModal;
