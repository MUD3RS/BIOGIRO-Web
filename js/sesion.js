
/*
 * BIOGIRO v2.6
 * Interfaz de autenticación Firebase
 * Circular Nexum Industries
 *
 * No modifica ni sincroniza las rutas locales.
 */

import './firebase.js';

const firebase = window.BIOGIROFirebase;

const estilos = document.createElement('style');

estilos.textContent = `
    #biogiro-acceso {
        position: fixed;
        right: 22px;
        bottom: 22px;
        z-index: 10000;
        font-family: inherit;
    }

    #biogiro-acceso * {
        box-sizing: border-box;
    }

    #biogiro-acceso .acceso-boton {
        display: flex;
        align-items: center;
        gap: 9px;
        border: 0;
        border-radius: 30px;
        padding: 12px 18px;
        background: #174c37;
        color: white;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 8px 25px rgba(0, 0, 0, .2);
    }

    #biogiro-acceso .acceso-boton:hover {
        background: #236b4d;
    }

    #biogiro-acceso .acceso-punto {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: #f3b94e;
        flex-shrink: 0;
    }

    #biogiro-acceso .acceso-punto.conectado {
        background: #69e7a0;
    }

    #biogiro-acceso .acceso-panel {
        position: absolute;
        bottom: 58px;
        right: 0;
        width: min(350px, calc(100vw - 30px));
        padding: 22px;
        border-radius: 16px;
        background: #ffffff;
        color: #183528;
        box-shadow: 0 12px 45px rgba(0, 0, 0, .25);
        border: 1px solid #dce9e1;
    }

    #biogiro-acceso .acceso-panel[hidden],
    #biogiro-acceso [hidden] {
        display: none !important;
    }

    #biogiro-acceso h3 {
        margin: 0 0 7px;
        font-size: 19px;
        font-weight: 750;
        color: #153f2c;
    }

    #biogiro-acceso .acceso-descripcion {
        margin: 0 0 17px;
        font-size: 12px;
        line-height: 1.6;
        color: #64796e;
    }

    #biogiro-acceso label {
        display: block;
        margin-bottom: 5px;
        font-size: 12px;
        font-weight: 650;
    }

    #biogiro-acceso input {
        display: block;
        width: 100%;
        margin-bottom: 13px;
        padding: 11px;
        border: 1px solid #cbd9d0;
        border-radius: 8px;
        background: white;
        color: #183528;
        font-size: 13px;
    }

    #biogiro-acceso input:focus {
        outline: 2px solid #76b99a;
        outline-offset: 1px;
    }

    #biogiro-acceso .acceso-accion {
        width: 100%;
        border: 0;
        border-radius: 8px;
        padding: 11px;
        background: #20814f;
        color: white;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
    }

    #biogiro-acceso .acceso-accion:hover {
        background: #176a40;
    }

    #biogiro-acceso .acceso-accion:disabled {
        opacity: .6;
        cursor: wait;
    }

    #biogiro-acceso .acceso-secundario {
        background: #e8f2eb;
        color: #23533a;
    }

    #biogiro-acceso .acceso-correo {
        overflow-wrap: anywhere;
        margin: 12px 0 16px;
        font-size: 13px;
        font-weight: 650;
    }

    #biogiro-acceso .acceso-mensaje {
        margin: 13px 0 0;
        font-size: 12px;
        line-height: 1.5;
        color: #236b4d;
    }

    #biogiro-acceso .acceso-mensaje.error {
        color: #b3261e;
    }

    @media (max-width: 600px) {
        #biogiro-acceso {
            right: 12px;
            bottom: 12px;
        }
    }
`;

document.head.appendChild(estilos);

const contenedor = document.createElement('div');
contenedor.id = 'biogiro-acceso';

contenedor.innerHTML = `
    <button
        id="acceso-abrir"
        class="acceso-boton"
        type="button"
        aria-expanded="false"
        aria-controls="acceso-panel"
    >
        <span id="acceso-punto" class="acceso-punto"></span>
        <span id="acceso-etiqueta">Verificando sesión...</span>
    </button>

    <section
        id="acceso-panel"
        class="acceso-panel"
        aria-label="Acceso a BIOGIRO"
        hidden
    >
        <h3>Acceso BIOGIRO</h3>

        <p class="acceso-descripcion">
            Inicia sesión para utilizar los servicios
            compartidos de Firebase.
        </p>

        <form id="acceso-formulario">
            <label for="acceso-correo">
                Correo electrónico
            </label>

            <input
                id="acceso-correo"
                type="email"
                autocomplete="username"
                placeholder="correo@ejemplo.com"
                required
            >

            <label for="acceso-clave">
                Contraseña
            </label>

            <input
                id="acceso-clave"
                type="password"
                autocomplete="current-password"
                placeholder="Tu contraseña"
                required
            >

            <button
                id="acceso-entrar"
                class="acceso-accion"
                type="submit"
            >
                Iniciar sesión
            </button>
        </form>

        <div id="acceso-usuario" hidden>
            <p class="acceso-descripcion">
                Sesión autenticada y autorizada.
            </p>

            <p id="acceso-correo-actual"
               class="acceso-correo"></p>

            <button
                id="acceso-salir"
                class="acceso-accion acceso-secundario"
                type="button"
            >
                Cerrar sesión
            </button>
        </div>

        <p
            id="acceso-mensaje"
            class="acceso-mensaje"
            role="status"
            aria-live="polite"
        ></p>
    </section>
`;

document.body.appendChild(contenedor);

const $ = id => document.getElementById(id);

let procesando = false;
let sesionVerificada = false;
let usuarioActual = null;

function mensaje(texto, error = false) {
    const salida = $('acceso-mensaje');
    salida.textContent = texto;
    salida.classList.toggle('error', error);
}

function mostrarPanel(abierto) {
    $('acceso-panel').hidden = !abierto;

    $('acceso-abrir').setAttribute(
        'aria-expanded',
        String(abierto)
    );
}

function actualizarInterfaz(usuario) {
    usuarioActual = usuario;
    sesionVerificada = true;

    const conectado = Boolean(usuario);

    $('acceso-punto').classList.toggle(
        'conectado',
        conectado
    );

    $('acceso-etiqueta').textContent = conectado
        ? 'Firebase conectado'
        : 'Modo local';

    $('acceso-formulario').hidden = conectado;
    $('acceso-usuario').hidden = !conectado;

    $('acceso-correo-actual').textContent =
        usuario?.correo || '';

    if (conectado) {
        $('acceso-clave').value = '';

        mensaje(
            'Sesión activa. Las rutas locales todavía ' +
            'no se sincronizan automáticamente.'
        );
    } else {
        mensaje(
            'BIOGIRO funciona localmente. ' +
            'Inicia sesión para acceder a Firebase.'
        );
    }

    document.dispatchEvent(
        new CustomEvent('biogiro:sesion', {
            detail: {
                conectado,
                uid: usuario?.uid || null
            }
        })
    );
}

function traducirError(error) {
    switch (error?.code) {
        case 'auth/invalid-email':
            return 'El correo electrónico no es válido.';

        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
            return 'Correo o contraseña incorrectos.';

        case 'auth/too-many-requests':
            return 'Demasiados intentos. Espera antes de reintentar.';

        case 'auth/network-request-failed':
            return 'No hay conexión con Firebase.';

        case 'auth/user-disabled':
            return 'Esta cuenta está deshabilitada.';

        default:
            return error?.message ||
                'No fue posible completar la operación.';
    }
}

$('acceso-abrir').addEventListener('click', () => {
    mostrarPanel($('acceso-panel').hidden);
});

$('acceso-formulario').addEventListener(
    'submit',
    async evento => {
        evento.preventDefault();

        if (procesando || !sesionVerificada) {
            return;
        }

        const correo = $('acceso-correo').value.trim();
        const clave = $('acceso-clave').value;

        procesando = true;
        $('acceso-entrar').disabled = true;

        mensaje('Verificando credenciales...');

        try {
            await firebase.iniciarSesion(correo, clave);

            mensaje('Inicio de sesión correcto.');
        } catch (error) {
            mensaje(traducirError(error), true);
        } finally {
            $('acceso-clave').value = '';
            $('acceso-entrar').disabled = false;
            procesando = false;
        }
    }
);

$('acceso-salir').addEventListener(
    'click',
    async () => {
        if (procesando) return;

        procesando = true;
        $('acceso-salir').disabled = true;

        try {
            await firebase.cerrarSesion();

            mensaje('Sesión cerrada correctamente.');
        } catch (error) {
            mensaje(traducirError(error), true);
        } finally {
            $('acceso-salir').disabled = false;
            procesando = false;
        }
    }
);

firebase.observarSesion(usuario => {
    actualizarInterfaz(usuario);
});

window.BIOGIROSesion = {
    conectado: () => Boolean(usuarioActual),
    usuario: () => usuarioActual
};

console.log(
    'BIOGIRO v2.6: interfaz de autenticación cargada.'
);
