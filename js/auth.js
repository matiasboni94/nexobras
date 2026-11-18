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

  /**
   * (17/11) "Sumá tu negocio" (encabezado, menú del celular, pie): sin cuenta
   * abre el registro con "Soy proveedor" ya elegido; con cuenta de proveedor
   * (o admin) va a "Mi Proveedor"; con cuenta común abre "Mi Perfil", que
   * tiene el botón "Convertirme en proveedor".
   */
  export function startProviderSignup() {
    ST.logEvent('provider_cta', 'Sumá tu negocio');
    if (!ST.authState.user) {
      showAuthTab('register');
      const radio = document.querySelector('input[name="register-role"][value="provider"]');
      if (radio) radio.checked = true;
      openAuthModal();
      return;
    }
    const role = ST.authState.profile && ST.authState.profile.role;
    if (role === 'provider' || role === 'admin') {
      window.nexoBraApp.switchView('provider');
      return;
    }
    openProfileModal();
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
        .select('full_name, public_nickname, role, phone, locality, matricula, rubro_habitual, role_confirmed, referral_source')
        .eq('id', ST.authState.user.id)
        .single();
      ST.authState.profile = profile || null;

      const nombre = (profile?.full_name || '').trim() || ST.authState.user.email;
      ST.authHeaderLabel.textContent = nombre.length > 18 ? nombre.slice(0, 16) + '…' : nombre;

      Provider.updateProviderNavVisibility();
      Admin.updateAdminNavVisibility();
      MapModule.loadFavoriteIds();
      MapModule.loadAlertIds();
      MapModule.loadOfferSubscriptionIds();

      // (16/11, auditoría 12/11 falla 8) "¿Cómo nos conociste?" para TODAS
      // las cuentas, no solo las que se registran con email:
      //  - Si se registró con email y el dato quedó en los metadatos de la
      //    cuenta (confirmación por mail, o la carrera entre este refresco y
      //    el UPDATE de handleRegister), se copia solo al perfil, sin preguntar.
      //  - Si entró con Google por primera vez (role_confirmed = false), se
      //    pregunta junto con el rol, obligatorio.
      //  - Cuentas que ya existían sin el dato: se pregunta una vez, con
      //    "Ahora no" para saltearlo (queda guardado en este navegador).
      if (profile) {
        const metaReferral = ST.authState.user.user_metadata?.referral_source;
        if (!profile.referral_source && metaReferral) {
          const { error: refError } = await ST.supabaseClient.from('profiles').update({ referral_source: metaReferral }).eq('id', ST.authState.user.id);
          if (!refError) profile.referral_source = metaReferral;
        }
        const needsRole = profile.role_confirmed === false;
        const needsReferral = !profile.referral_source && !isReferralSkipped(ST.authState.user.id);
        if (needsRole || needsReferral) openRoleModal({ needsRole, needsReferral });
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
    const referralSource = document.getElementById('register-referral-source').value;
    const btn = document.getElementById('btn-submit-register');
    btn.disabled = true;
    btn.textContent = 'Creando cuenta...';
    ST.logEvent('signup_start', 'email');

    const { data, error } = await ST.supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role, referral_source: referralSource || null } }
    });

    btn.disabled = false;
    btn.textContent = 'Crear cuenta';

    if (error) {
      showAuthError(translateAuthError(error.message));
      return;
    }

    ST.logEvent('signup', 'email');
    if (data.session) {
      // Confirmación de email desactivada en el proyecto: queda logueado directo.
      // "Cómo nos conociste" (06/11) se guarda con un UPDATE directo en vez de
      // confiar en que el trigger handle_new_user() (no trackeado en ninguna
      // migración, ver advertencia #21/#29) lea este campo de los metadatos --
      // mismo patrón ya usado en becomeProvider()/handleProfileSubmit() más
      // abajo, no hace falta tocar esa función para nada.
      if (referralSource) {
        await ST.supabaseClient.from('profiles').update({ referral_source: referralSource }).eq('id', data.session.user.id);
      }
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
    // Para el embudo del tablero: solo cuenta como "empezó a registrarse" si
    // tocó Google con la pestaña Registrarme abierta (el mismo botón se usa
    // para ingresar a una cuenta que ya existe).
    if (ST.authFormRegister && ST.authFormRegister.style.display !== 'none') ST.logEvent('signup_start', 'google');
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
    document.getElementById('profile-nickname').value = ST.authState.profile?.public_nickname || '';
    document.getElementById('profile-rubro').value = ST.authState.profile?.rubro_habitual || '';

    // Solo se ofrece "convertirse en proveedor" a cuentas que hoy son
    // usuario común -- si ya es proveedor o admin, no tiene sentido mostrarlo.
    const becomeProviderSection = document.getElementById('profile-become-provider-section');
    if (becomeProviderSection) {
      becomeProviderSection.style.display = ST.authState.profile?.role === 'user' ? 'block' : 'none';
    }

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

  /**
   * Un usuario común pide convertirse en proveedor, desde su propio
   * perfil -- no hace falta que un admin lo apruebe para este paso: lo
   * único que hace es desbloquearle el acceso al panel "Mi Proveedor".
   * La aprobación real sigue pasando después, cuando complete sus datos
   * comerciales (verification_status), igual que siempre.
   */
  export async function becomeProvider() {
    if (!ST.authState.user) return;
    const btn = document.getElementById('btn-become-provider');
    if (btn) { btn.disabled = true; btn.textContent = 'Un momento...'; }

    const { error } = await ST.supabaseClient
      .from('profiles')
      .update({ role: 'provider' })
      .eq('id', ST.authState.user.id);

    if (error) {
      ST.showToast('No se pudo hacer el cambio: ' + error.message);
      if (btn) { btn.disabled = false; btn.textContent = 'Convertirme en proveedor'; }
      return;
    }

    ST.authState.profile.role = 'provider';
    document.getElementById('profile-become-provider-section').style.display = 'none';
    Provider.updateProviderNavVisibility();
    ST.showToast('¡Listo! Ya tenés acceso a "Mi Proveedor" en el menú.');
    closeProfileModal();
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
        public_nickname: document.getElementById('profile-nickname').value.trim() || null,
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
    const btnBecomeProvider = document.getElementById('btn-become-provider');
    if (btnBecomeProvider) btnBecomeProvider.addEventListener('click', becomeProvider);
  }

  // --- ELEGIR ROL (solo la primera vez que se entra por Google) ---
  // El registro manual ya pregunta el rol en el propio formulario. Google no
  // permite mandar ese dato antes de redirigir, así que se lo preguntamos acá
  // apenas vuelve con sesión, una única vez (profiles.role_confirmed lo controla).
  let onboardingMode = { needsRole: true, needsReferral: true };

  function referralSkipKey(userId) { return `nexobra_ref_skip_${userId}`; }
  function isReferralSkipped(userId) {
    try { return localStorage.getItem(referralSkipKey(userId)) === '1'; } catch (err) { return false; }
  }

  export function openRoleModal(mode = { needsRole: true, needsReferral: true }) {
    onboardingMode = mode;
    const roleBlock = document.getElementById('onboarding-role-block');
    const referralBlock = document.getElementById('onboarding-referral-block');
    const referralSelect = document.getElementById('onboarding-referral-source');
    const skipBtn = document.getElementById('btn-skip-onboarding');
    const title = document.getElementById('modal-role-title');
    if (roleBlock) roleBlock.style.display = mode.needsRole ? '' : 'none';
    if (referralBlock) referralBlock.style.display = mode.needsReferral ? '' : 'none';
    if (referralSelect) referralSelect.required = !!mode.needsReferral;
    // Solo se puede saltear cuando es la pregunta suelta a una cuenta que ya
    // existía; en el primer ingreso con Google el rol hace falta igual.
    if (skipBtn) skipBtn.style.display = mode.needsRole ? 'none' : '';
    if (title) title.textContent = mode.needsRole ? '¡Bienvenido a NEXOBRA!' : 'Una pregunta rápida';
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
    const update = {};
    if (onboardingMode.needsRole) {
      update.role = document.querySelector('input[name="onboarding-role"]:checked').value;
      update.role_confirmed = true;
    }
    if (onboardingMode.needsReferral) {
      const referral = document.getElementById('onboarding-referral-source').value;
      if (!referral) {
        ST.roleErrorMsg.textContent = 'Elegí cómo nos conociste para seguir.';
        ST.roleErrorMsg.style.display = 'block';
        return;
      }
      update.referral_source = referral;
    }
    const btn = document.getElementById('btn-submit-role');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    const { error } = await ST.supabaseClient
      .from('profiles')
      .update(update)
      .eq('id', ST.authState.user.id);

    btn.disabled = false;
    btn.textContent = 'Continuar';

    if (error) {
      ST.roleErrorMsg.textContent = 'No se pudo guardar: ' + error.message;
      ST.roleErrorMsg.style.display = 'block';
      return;
    }

    if (onboardingMode.needsRole) ST.logEvent('signup', 'google');
    closeRoleModal();
    await refreshAuthUI();
    ST.showToast(onboardingMode.needsRole ? '¡Listo! Ya podés usar NEXOBRA.' : '¡Gracias!');
  }

  export function skipOnboardingQuestion() {
    if (ST.authState.user) {
      try { localStorage.setItem(referralSkipKey(ST.authState.user.id), '1'); } catch (err) { /* sin localStorage: se vuelve a preguntar la próxima vez */ }
    }
    closeRoleModal();
  }

  export function setupRoleListeners() {
    if (!ST.supabaseClient) return;
    ST.roleForm.addEventListener('submit', handleRoleSubmit);
    const skipBtn = document.getElementById('btn-skip-onboarding');
    if (skipBtn) skipBtn.addEventListener('click', skipOnboardingQuestion);
    // A propósito NO se cierra clickeando el backdrop: es un paso obligatorio
    // la primera vez, para no dejar perfiles a medio configurar.
  }

  // --- MIS PRESUPUESTOS (Fase B) ---
  // El cómputo sigue viviendo en ST.state.computoCart y localStorage mientras se edita
  // (igual que antes). Lo nuevo es que, si hay sesión iniciada, se puede además
  // guardar/actualizar como una fila en "computations" + "computation_items".
