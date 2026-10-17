
/*
 * BIOGIRO v2.6
 * Firebase Authentication y Cloud Firestore
 * Circular Nexum Industries
 *
 * Incluye escrituras protegidas mediante transacciones.
 */

import { initializeApp } from
    'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';

import {
    getAuth,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';

import {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    runTransaction
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyAMIAIBloJt0F6AG31cmO0FFTuUrBMrIO8",
    authDomain: "biogiro-24fd4.firebaseapp.com",
    projectId: "biogiro-24fd4",
    storageBucket: "biogiro-24fd4.firebasestorage.app",
    messagingSenderId: "426277949540",
    appId: "1:426277949540:web:0cc88e0ed2d40167f40f71"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const UID_AUTORIZADO = "BLhFWkwmt1du5SdUEs3t3yYhlv23";

function usuarioAutorizado() {
    return auth.currentUser !== null &&
        auth.currentUser.uid === UID_AUTORIZADO;
}

function verificarAcceso() {
    if (!usuarioAutorizado()) {
        throw new Error(
            'Debes iniciar sesión con una cuenta autorizada.'
        );
    }
}

function verificarId(id) {
    if (
        typeof id !== 'string' ||
        id.length < 1 ||
        id.length > 100 ||
        id === '.' ||
        id === '..' ||
        id.includes('/')
    ) {
        throw new Error('Identificador de ruta inválido.');
    }
}

function referenciaRuta(id) {
    verificarId(id);
    return doc(db, 'rutas', id);
}

function normalizarDatos(ruta, creadoEnOriginal = null) {
    if (!ruta || typeof ruta !== 'object') {
        throw new Error('La ruta no es válida.');
    }

    return {
        nombre: ruta.nombre,
        fecha: ruta.fecha,
        estado: ruta.estado,
        notas: ruta.notas || '',
        paradas: ruta.paradas.map(parada => ({
            id_denue: parada.id_denue,
            litros: parada.litros
        })),
        simulacion: true,
        creadoEn: creadoEnOriginal ||
            ruta.creadoEn ||
            new Date().toISOString(),
        actualizadoEn: new Date().toISOString()
    };
}

function firmaRuta(ruta) {
    if (!ruta) return null;

    return JSON.stringify({
        nombre: ruta.nombre,
        fecha: ruta.fecha,
        estado: ruta.estado,
        notas: ruta.notas || '',
        paradas: Array.isArray(ruta.paradas)
            ? ruta.paradas.map(parada => ({
                id_denue: parada.id_denue,
                litros: parada.litros
            }))
            : [],
        simulacion: ruta.simulacion,
        creadoEn: ruta.creadoEn,
        actualizadoEn: ruta.actualizadoEn
    });
}

async function iniciarSesion(correo, contrasena) {
    const credencial = await signInWithEmailAndPassword(
        auth,
        correo,
        contrasena
    );

    if (credencial.user.uid !== UID_AUTORIZADO) {
        await signOut(auth);

        throw new Error(
            'Esta cuenta no tiene autorización para BIOGIRO.'
        );
    }

    return {
        uid: credencial.user.uid,
        correo: credencial.user.email
    };
}

async function cerrarSesion() {
    await signOut(auth);
}

function observarSesion(callback) {
    return onAuthStateChanged(auth, usuario => {
        callback(
            usuario && usuario.uid === UID_AUTORIZADO
                ? {
                    uid: usuario.uid,
                    correo: usuario.email
                }
                : null
        );
    });
}

async function obtenerRutas() {
    verificarAcceso();

    const consulta = await getDocs(collection(db, 'rutas'));

    return consulta.docs.map(documento => ({
        id: documento.id,
        ...documento.data()
    }));
}

async function obtenerRuta(id) {
    verificarAcceso();

    const resultado = await getDoc(referenciaRuta(id));

    return resultado.exists()
        ? { id: resultado.id, ...resultado.data() }
        : null;
}

/*
 * Escritura original para compatibilidad con otros módulos.
 * La interfaz de sincronización utilizará guardarRutaSegura().
 */
async function guardarRuta(ruta) {
    verificarAcceso();
    verificarId(ruta?.id);

    const referencia = referenciaRuta(ruta.id);
    const datos = normalizarDatos(ruta);

    await setDoc(referencia, datos);

    return { id: ruta.id, ...datos };
}

/*
 * Guardar con control de concurrencia.
 *
 * esperado:
 *   null: el documento no debe existir.
 *   firma: el documento debe coincidir exactamente.
 *
 * La lectura y la escritura ocurren en una transacción.
 */
async function guardarRutaSegura(ruta, esperado = null) {
    verificarAcceso();
    verificarId(ruta?.id);

    const referencia = referenciaRuta(ruta.id);

    return runTransaction(db, async transaccion => {
        const documento = await transaccion.get(referencia);

        const actual = documento.exists()
            ? { id: documento.id, ...documento.data() }
            : null;

        if (firmaRuta(actual) !== esperado) {
            throw new Error(
                'CONFLICTO_REMOTO: la ruta cambió en Firebase. ' +
                'Consulta nuevamente antes de continuar.'
            );
        }

        const datos = normalizarDatos(
            ruta,
            actual?.creadoEn || ruta.creadoEn
        );

        transaccion.set(referencia, datos);

        return { id: ruta.id, ...datos };
    });
}

/*
 * Eliminar solamente si el documento coincide con
 * la versión que el usuario revisó.
 */
async function eliminarRutaSegura(id, esperado) {
    verificarAcceso();

    const referencia = referenciaRuta(id);

    return runTransaction(db, async transaccion => {
        const documento = await transaccion.get(referencia);

        if (!documento.exists()) {
            throw new Error(
                'La ruta ya no existe en Firebase.'
            );
        }

        const actual = {
            id: documento.id,
            ...documento.data()
        };

        if (firmaRuta(actual) !== esperado) {
            throw new Error(
                'CONFLICTO_REMOTO: la ruta cambió en Firebase. ' +
                'Consulta nuevamente antes de eliminarla.'
            );
        }

        transaccion.delete(referencia);
        return true;
    });
}

async function eliminarRuta(id) {
    verificarAcceso();
    await deleteDoc(referenciaRuta(id));
}

window.BIOGIROFirebase = {
    iniciarSesion,
    cerrarSesion,
    observarSesion,
    usuarioAutorizado,
    obtenerRutas,
    obtenerRuta,
    guardarRuta,
    guardarRutaSegura,
    eliminarRuta,
    eliminarRutaSegura,
    firmaRuta
};

console.log(
    'BIOGIRO v2.6: Firebase y transacciones inicializados.'
);
