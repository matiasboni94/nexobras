// NEXOBRA - auth.js

import * as Admin from './admin.js';
import * as Computo from './computo.js';
import * as MapModule from './map.js';
import * as Provider from './provider.js';
import * as ST from './state.js';

  export function openAuthModal() {
    hideAuthMessages();
    ST.authModal.classList.add('open');
    ST.authModalBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  export function closeAuthModal() {
    ST.authModal.classList.remove('open');
    ST.authModalBackdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  export function showAuthTab(tab) {
    hideAuthMessages();
    const isLogin = tab === 'login';
    ST.authTabLogin.classList.toggle('active', isLogin);
    ST.authTabRegister.classList.toggle('active', !isLogin);
    ST.authFormLogin.style.display = isLogin ? 'flex' : 'none';
    ST.authFormRegister.style.display = isLogin ? 'none' : 'flex';
  }

  export function showAuthError(message) {
    ST.authInfoMsg.style.display = 'none';
    ST.authErrorMsg.textContent = message;
    ST.authErrorMsg.style.display = 'block';
  }

  export function showAuthInfo(message) {
    ST.authErrorMsg.style.display = 'none';
    ST.authInfoMsg.textContent = message;
    ST.authInfoMsg.style.display = 'block';
  }

  export function hideAuthMessages() {
    ST.authErrorMsg.style.display = 'none';
    ST.authInfoMsg.style.display = 'none';
  }

  /** Traduce los mensajes de error más comunes de Supabase Auth al español. */
  export function translateAuthError(message) {
    const map = {
      'Invalid login credentials': 'Email o contraseña incorrectos.',
      'User already registered': 'Ya existe una cuenta con ese email. Probá ingresar en vez de registrarte.',
      'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
      'Email not confirmed': 'Todavía no confirmaste tu email. Revisá tu casilla de correo.'
    };
    return map[message] || message;
  }

  export async function refreshAuthUI() {
    if (!ST.supabaseClient) return;
    const { data: { session } } = await ST.supabaseClient.auth.getSession();
    ST.authState.user = session?.user || null;
    ST.authState.profile = null;

    if (ST.authState.user) {
      const { data: profile } = await ST.supabaseClient
        .from('profiles')
        .select('full_name, role, phone, locality, matricula, rubro_habitual, role_confirmed')
        .eq('id', ST.authState.user.id)
        .single();
      ST.authState.profile = profile || null;

      const nombre = (profile?.full_name || '').trim() || ST.authState.user.email;
      ST.authHeaderLabel.textContent = nombre.length > 18 ? nombre.slice(0, 16) + '…' : nombre;

      Provider.updateProviderNavVisibility();
      Admin.updateAdminNavVisibility();
      MapModule.loadFavoriteIds();
      MapModule.loadAlertIds();

      if (profile && profile.role_confirmed === false) {
        openRoleModal();
      }
    } else {
      ST.authHeaderLabel.textContent = 'Ingresar';
    }
  }

  export async function handleLogin(e) {
    e.preventDefault();
    hideAuthMessages();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('btn-submit-login');
    btn.disabled = true;
    btn.textContent = 'Ingresando...';

    const { error } = await ST.supabaseClient.auth.signInWithPassword({ email, password });

    btn.disabled = false;
    btn.textContent = 'Ingresar';

    if (error) {
      showAuthError(translateAuthError(error.message));
      return;
    }
    await refreshAuthUI();
    closeAuthModal();
    ST.showToast('¡Bienvenido de nuevo!');
  }

  export async function handleRegister(e) {
    e.preventDefault();
    hideAuthMessages();
    const fullName = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const role = document.querySelector('input[name="register-role"]:checked').value;
    const btn = document.getElementById('btn-submit-register');
    btn.disabled = true;
    btn.textContent = 'Creando cuenta...';

    const { data, error } = await ST.supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } }
    });

    btn.disabled = false;
    btn.textContent = 'Crear cuenta';

    if (error) {
      showAuthError(translateAuthError(error.message));
      return;
    }

    if (data.session) {
      // Confirmación de email desactivada en el proyecto: queda logueado directo.
      await refreshAuthUI();
      closeAuthModal();
      ST.showToast('¡Cuenta creada! Ya estás dentro.');
    } else {
      // Confirmación de email activada: falta que confirme desde el correo.
      showAuthInfo('¡Listo! Te mandamos un email para confirmar tu cuenta. Una vez confirmado, ya podés ingresar.');
      ST.authFormRegister.reset();
    }
  }

  export async function handleForgotPassword() {
    hideAuthMessages();
    const email = document.getElementById('login-email').value.trim();
    if (!email) {
      showAuthError('Escribí tu email arriba primero y volvé a tocar "Olvidé mi contraseña".');
      return;
    }
    const { error } = await ST.supabaseClient.auth.resetPasswordForEmail(email);
    if (error) {
      showAuthError(translateAuthError(error.message));
      return;
    }
    showAuthInfo('Te mandamos un email con instrucciones para reestablecer tu contraseña.');
  }

  export async function handleGoogleAuth() {
    hideAuthMessages();
    const { error } = await ST.supabaseClient.auth.signInWithOAuth({ provider: 'google' });
    if (error) {
      showAuthError('El login con Google no está disponible todavía. Probá con email y contraseña.');
    }
  }

  export async function handleLogout() {
    if (!ST.supabaseClient) return;
    await ST.supabaseClient.auth.signOut();
    ST.authState.user = null;
    ST.authState.profile = null;
    ST.authDropdown.style.display = 'none';
    ST.computationState.currentId = null;
    Computo.updateComputationNameUI();
    await refreshAuthUI();
    ST.showToast('Cerraste sesión.');
  }

  export function setupAuthListeners() {
    if (!ST.supabaseClient) {
      if (ST.btnOpenAuthModal) ST.btnOpenAuthModal.style.display = 'none';
      return;
    }

    ST.btnOpenAuthModal.addEventListener('click', () => {
      if (ST.authState.user) {
        ST.authDropdown.style.display = ST.authDropdown.style.display === 'none' ? 'block' : 'none';
      } else {
        showAuthTab('login');
        openAuthModal();
      }
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.auth-header-wrapper')) ST.authDropdown.style.display = 'none';
    });

    ST.authModalCloseBtn.addEventListener('click', closeAuthModal);
    ST.authModalBackdrop.addEventListener('click', closeAuthModal);
    ST.authTabLogin.addEventListener('click', () => showAuthTab('login'));
    ST.authTabRegister.addEventListener('click', () => showAuthTab('register'));
    ST.authFormLogin.addEventListener('submit', handleLogin);
    ST.authFormRegister.addEventListener('submit', handleRegister);
    ST.btnForgotPassword.addEventListener('click', handleForgotPassword);
    ST.btnGoogleAuth.addEventListener('click', handleGoogleAuth);
    ST.btnLogout.addEventListener('click', handleLogout);

    ST.supabaseClient.auth.onAuthStateChange(() => { refreshAuthUI(); });
    refreshAuthUI();
  }

  // --- PERFIL (Fase B) ---
  export function openProfileModal() {
    if (!ST.authState.user) return;
    ST.profileErrorMsg.style.display = 'none';
    ST.profileInfoMsg.style.display = 'none';
    document.getElementById('profile-full-name').value = ST.authState.profile?.full_name || '';
    document.getElementById('profile-email').value = ST.authState.user.email || '';
    document.getElementById('profile-phone').value = ST.authState.profile?.phone || '';
    document.getElementById('profile-locality').value = ST.authState.profile?.locality || '';
    document.getElementById('profile-matricula').value = ST.authState.profile?.matricula || '';
    document.getElementById('profile-rubro').value = ST.authState.profile?.rubro_habitual || '';
    ST.profileModal.classList.add('open');
    ST.profileModalBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
    ST.authDropdown.style.display = 'none';
  }

  export function closeProfileModal() {
    ST.profileModal.classList.remove('open');
    ST.profileModalBackdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  export async function handleProfileSubmit(e) {
    e.preventDefault();
    if (!ST.authState.user) return;
    const btn = document.getElementById('btn-submit-profile');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    const { error } = await ST.supabaseClient
      .from('profiles')
      .update({
        full_name: document.getElementById('profile-full-name').value.trim(),
        phone: document.getElementById('profile-phone').value.trim() || null,
        locality: document.getElementById('profile-locality').value.trim() || null,
        matricula: document.getElementById('profile-matricula').value.trim() || null,
        rubro_habitual: document.getElementById('profile-rubro').value.trim() || null
      })
      .eq('id', ST.authState.user.id);

    btn.disabled = false;
    btn.textContent = 'Guardar cambios';

    if (error) {
      ST.profileErrorMsg.textContent = 'No se pudo guardar: ' + error.message;
      ST.profileErrorMsg.style.display = 'block';
      return;
    }

    await refreshAuthUI();
    ST.profileInfoMsg.textContent = 'Perfil actualizado.';
    ST.profileInfoMsg.style.display = 'block';
    ST.showToast('Perfil actualizado.');
  }

  export function setupProfileListeners() {
    if (!ST.supabaseClient) return;
    ST.btnOpenProfile.addEventListener('click', openProfileModal);
    ST.profileModalCloseBtn.addEventListener('click', closeProfileModal);
    ST.profileModalBackdrop.addEventListener('click', closeProfileModal);
    ST.profileForm.addEventListener('submit', handleProfileSubmit);
  }

  // --- ELEGIR ROL (solo la primera vez que se entra por Google) ---
  // El registro manual ya pregunta el rol en el propio formulario. Google no
  // permite mandar ese dato antes de redirigir, así que se lo preguntamos acá
  // apenas vuelve con sesión, una única vez (profiles.role_confirmed lo controla).
  export function openRoleModal() {
    ST.roleErrorMsg.style.display = 'none';
    ST.roleModal.classList.add('open');
    ST.roleModalBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  export function closeRoleModal() {
    ST.roleModal.classList.remove('open');
    ST.roleModalBackdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  export async function handleRoleSubmit(e) {
    e.preventDefault();
    const role = document.querySelector('input[name="onboarding-role"]:checked').value;
    const btn = document.getElementById('btn-submit-role');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    const { error } = await ST.supabaseClient
      .from('profiles')
      .update({ role, role_confirmed: true })
      .eq('id', ST.authState.user.id);

    btn.disabled = false;
    btn.textContent = 'Continuar';

    if (error) {
      ST.roleErrorMsg.textContent = 'No se pudo guardar: ' + error.message;
      ST.roleErrorMsg.style.display = 'block';
      return;
    }

    await refreshAuthUI();
    closeRoleModal();
    ST.showToast('¡Listo! Ya podés usar NEXOBRA.');
  }

  export function setupRoleListeners() {
    if (!ST.supabaseClient) return;
    ST.roleForm.addEventListener('submit', handleRoleSubmit);
    // A propósito NO se cierra clickeando el backdrop: es un paso obligatorio
    // la primera vez, para no dejar perfiles a medio configurar.
  }

  // --- MIS PRESUPUESTOS (Fase B) ---
  // El cómputo sigue viviendo en ST.state.computoCart y localStorage mientras se edita
  // (igual que antes). Lo nuevo es que, si hay sesión iniciada, se puede además
  // guardar/actualizar como una fila en "computations" + "computation_items".
