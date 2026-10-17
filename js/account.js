(function () {
  const status = document.getElementById('account-status');
  const forms = document.getElementById('account-forms');
  const signedInPanel = document.getElementById('signed-in-panel');
  const signedInEmail = document.getElementById('signed-in-email');
  const signedInName = document.getElementById('signed-in-name');
  const signupForm = document.getElementById('signup-form');
  const loginForm = document.getElementById('login-form');
  const signoutButton = document.getElementById('signout-button');

  function showStatus(message, kind) {
    status.textContent = message;
    status.dataset.kind = kind || 'info';
  }

  function getClient() {
    if (!window.bangsideSupabase) {
      showStatus('Account service did not initialize. Check your connection and reload.', 'error');
      return null;
    }
    return window.bangsideSupabase;
  }

  function showSignedIn(user) {
    if (user) {
      forms.hidden = true;
      signedInPanel.hidden = false;
      signedInEmail.textContent = user.email || 'Signed-in member';
      signedInName.textContent = user.user_metadata?.display_name || 'Loading member profile…';
      const client = window.bangsideSupabase;
      if (client) {
        client.from('profiles')
          .select('display_name, handle')
          .eq('id', user.id)
          .maybeSingle()
          .then(({ data, error }) => {
            if (!error && data && data.display_name) {
              signedInName.textContent = data.display_name + (data.handle ? ' · @' + data.handle : '');
            }
          });
      }
      showStatus('You are signed in.', 'success');
    } else {
      forms.hidden = false;
      signedInPanel.hidden = true;
    }
  }

  signupForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    const client = getClient();
    if (!client) return;

    const button = signupForm.querySelector('button[type="submit"]');
    button.disabled = true;
    showStatus('Creating your account…', 'info');

    try {
      const displayName = document.getElementById('signup-name').value.trim();
      const email = document.getElementById('signup-email').value.trim();
      const password = document.getElementById('signup-password').value;

      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: window.location.origin + '/account.html'
        }
      });

      if (error) throw error;

      if (data.session && data.user) {
        showSignedIn(data.user);
        showStatus('Account created and signed in.', 'success');
      } else {
        showStatus('Account request received. Check your email for a confirmation link before signing in.', 'success');
      }
      signupForm.reset();
    } catch (error) {
      showStatus(error.message || 'Could not create account. Please try again.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  loginForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    const client = getClient();
    if (!client) return;

    const button = loginForm.querySelector('button[type="submit"]');
    button.disabled = true;
    showStatus('Signing in…', 'info');

    try {
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const { data, error } = await client.auth.signInWithPassword({ email, password });

      if (error) throw error;
      showSignedIn(data.user);
      loginForm.reset();
    } catch (error) {
      showStatus(error.message || 'Sign-in failed. Check your details and try again.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  signoutButton.addEventListener('click', async function () {
    const client = getClient();
    if (!client) return;

    signoutButton.disabled = true;
    showStatus('Signing out…', 'info');

    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      showSignedIn(null);
      showStatus('You have signed out.', 'success');
    } catch (error) {
      showStatus(error.message || 'Could not sign out. Please try again.', 'error');
    } finally {
      signoutButton.disabled = false;
    }
  });

  const client = getClient();
  if (client) {
    client.auth.getSession().then(function ({ data, error }) {
      if (error) {
        showStatus('Could not check your session. Reload the page to try again.', 'error');
        return;
      }
      showSignedIn(data.session ? data.session.user : null);
      if (!data.session) {
        showStatus('Create an account or sign in to continue.', 'info');
      }
    });

    client.auth.onAuthStateChange(function (_event, session) {
      showSignedIn(session ? session.user : null);
    });
  }
})();
