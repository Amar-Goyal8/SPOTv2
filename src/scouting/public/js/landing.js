// SPOTv2 Landing page logic
(async () => {
  const isDemo = await fetch("./auth/isDemo").then((r) => r.json()).catch(() => false);
  if (isDemo) document.getElementById("demo-badge").classList.add("visible");

  const cfg = await config;
  document.getElementById("version-string").textContent = `SPOTv2 v${cfg.VERSION || "2.0"}`;

  // Manual sign in
  document.getElementById("manual-signin").addEventListener("click", () => {
    updateForm();
    switchPage("form");
  });

  // Google sign in
  const googleBtn = document.getElementById("google-signin");

  async function tryGoogleSignIn() {
    if (typeof gapi === "undefined") {
      console.warn("Google API not loaded");
      return;
    }
    try {
      gapi.load("auth2", () => {
        const clientId = cfg.GOOGLE_AUTH?.CLIENT_ID || "";
        if (!clientId) { googleBtn.style.display = "none"; return; }

        const auth2 = gapi.auth2.init({ client_id: clientId });

        auth2.then(() => {
          if (auth2.isSignedIn.get()) handleSignedIn(auth2.currentUser.get(), auth2);
        }).catch(() => {});

        auth2.isSignedIn.listen((val) => { if (!val) switchPage("landing"); });
        auth2.currentUser.listen((user) => {
          if (auth2.isSignedIn.get()) handleSignedIn(user, auth2);
        });

        googleBtn.addEventListener("click", () => auth2.signIn());
      });
    } catch (e) { console.warn("Google auth setup failed", e); }
  }

  async function handleSignedIn(user, auth2) {
    try {
      const res = await fetch("/auth/verify", {
        headers: { "Content-Type": "application/json", token: user.getAuthResponse().id_token }
      }).then((r) => r.json());

      if (res.status) {
        if (res.dbUser) {
          window._spotUser = res.dbUser;
          localStorage.setItem("spotUserId", res.dbUser._id);
          localStorage.setItem("spotUserName", res.dbUser.name);
          localStorage.setItem("spotUserPicture", res.dbUser.picture || "");
        }
        ScoutingSync.updateState({ scouterId: res.user?.name || res.dbUser?.name, status: ScoutingSync.SCOUTER_STATUS.WAITING });
        if (ScoutingSync.socket) ScoutingSync.socket.emit("setUserId", res.dbUser?._id);
        switchPage("waiting");
      }
    } catch (e) { console.error("Sign-in failed", e); }
  }

  if (window.gapi) tryGoogleSignIn();
  else window.addEventListener("load", tryGoogleSignIn);
})();
