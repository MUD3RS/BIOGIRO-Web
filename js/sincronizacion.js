
'use strict';

import './firebase.js';

/*
 * BIOGIRO v2.6
 * Sincronización manual y resolución de conflictos
 * Circular Nexum Industries
 */

(() => {
    const storage = window.BIOGIROStorage;
    const firebase = window.BIOGIROFirebase;

    if (!storage || !firebase) {
        console.error(
            'BIOGIRO: faltan almacenamiento o Firebase.'
        );
        return;
    }

    const $ = id => document.getElementById(id);

    let ocupado = false;
    let rutasNube = [];
    let consultaRealizada = false;
    let conflictoActual = null;

    const ESTADOS = [
        'pendiente',
        'planificada',
        'completada'
    ];

    function informar(texto, error = false) {
        const elemento = $('sync-mensaje');

        elemento.textContent = texto;
        elemento.classList.toggle('text-danger', error);
        elemento.classList.toggle('text-success', !error);
    }

    function crearBoton(texto, clase, accion) {
        const boton = document.createElement('button');

        boton.type = 'button';
        boton.className = `btn btn-sm ${clase}`;
        boton.textContent = texto;
        boton.addEventListener('click', accion);

        return boton;
    }

    function celda(fila, valor) {
        const elemento = document.createElement('td');
        elemento.textContent = String(valor);
        fila.appendChild(elemento);
        return elemento;
    }

    function filaVacia(tbody, columnas, texto) {
        const fila = document.createElement('tr');
        const elemento = document.createElement('td');

        elemento.colSpan = columnas;
        elemento.className = 'sync-vacio';
        elemento.textContent = texto;

        fila.appendChild(elemento);
        tbody.appendChild(fila);
    }

    function idValido(id) {
        return typeof id === 'string' &&
            id.length > 0 &&
            id.length <= 100 &&
            id !== '.' &&
            id !== '..' &&
            !id.includes('/');
    }

    function validarRuta(ruta) {
        if (!ruta || !idValido(ruta.id)) {
            throw new Error('Identificador de ruta inválido.');
        }

        if (
            typeof ruta.nombre !== 'string' ||
            !ruta.nombre.trim() ||
            ruta.nombre.length > 100 ||
            typeof ruta.fecha !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(ruta.fecha) ||
            !ESTADOS.includes(ruta.estado) ||
            ruta.simulacion !== true
        ) {
            throw new Error(
                'La ruta no cumple el formato BIOGIRO.'
            );
        }

        const fecha = new Date(
            `${ruta.fecha}T12:00:00Z`
        );

        if (
            Number.isNaN(fecha.getTime()) ||
            fecha.toISOString().slice(0, 10) !== ruta.fecha
        ) {
            throw new Error('Fecha de ruta inválida.');
        }

        if (
            typeof ruta.notas !== 'string' ||
            ruta.notas.length > 500
        ) {
            throw new Error(
                'Las observaciones de la ruta no son válidas.'
            );
        }

        if (
            typeof ruta.creadoEn !== 'string' ||
            !ruta.creadoEn ||
            typeof ruta.actualizadoEn !== 'string' ||
            !ruta.actualizadoEn
        ) {
            throw new Error(
                'Faltan las fechas de registro.'
            );
        }

        if (
            !Array.isArray(ruta.paradas) ||
            ruta.paradas.length < 1 ||
            ruta.paradas.length > 25
        ) {
            throw new Error(
                'La ruta debe contener entre 1 y 25 paradas.'
            );
        }

        const ids = new Set();
        let centilitros = 0;

        for (const parada of ruta.paradas) {
            const id = parada?.id_denue;
            const litros = parada?.litros;

            if (
                typeof id !== 'string' ||
                !id ||
                id.length > 80 ||
                ids.has(id) ||
                typeof litros !== 'number' ||
                !Number.isFinite(litros) ||
                litros <= 0 ||
                litros > 300 ||
                Math.abs(
                    litros * 100 -
                    Math.round(litros * 100)
                ) > 0.000001
            ) {
                throw new Error(
                    'Una parada contiene datos inválidos.'
                );
            }

            ids.add(id);
            centilitros += Math.round(litros * 100);
        }

        if (centilitros > 30000) {
            throw new Error(
                'La ruta supera la capacidad de 300 litros.'
            );
        }

        return ruta;
    }

    function datosComparables(ruta) {
        if (!ruta) return null;

        return JSON.stringify({
            nombre: ruta.nombre,
            fecha: ruta.fecha,
            estado: ruta.estado,
            notas: ruta.notas || '',
            paradas: ruta.paradas.map(parada => ({
                id_denue: parada.id_denue,
                litros: parada.litros
            })),
            simulacion: ruta.simulacion
        });
    }

    function contenidoIgual(a, b) {
        return datosComparables(a) === datosComparables(b);
    }

    function volumen(ruta) {
        return ruta.paradas.reduce(
            (total, parada) => total + parada.litros,
            0
        );
    }

    function crearId() {
        if (
            typeof crypto !== 'undefined' &&
            typeof crypto.randomUUID === 'function'
        ) {
            return crypto.randomUUID();
        }

        throw new Error(
            'Se necesita un contexto seguro para generar ' +
            'identificadores de copias.'
        );
    }

    function copiaRuta(ruta) {
        const ahora = new Date().toISOString();

        return {
            id: crearId(),
            nombre: `${ruta.nombre} (copia)`.slice(0, 100),
            fecha: ruta.fecha,
            estado: ruta.estado,
            notas: ruta.notas,
            paradas: ruta.paradas.map(parada => ({
                id_denue: parada.id_denue,
                litros: parada.litros
            })),
            simulacion: true,
            creadoEn: ahora,
            actualizadoEn: ahora
        };
    }

    function guardarEnLocal(ruta) {
        const respaldo = {
            aplicacion: 'BIOGIRO',
            versionFormato: 1,
            tipo: 'respaldo-rutas',
            simulacion: true,
            exportadoEn: new Date().toISOString(),
            rutas: [ruta]
        };

        storage.importar(
            JSON.stringify(respaldo),
            'combinar'
        );

        mostrarLocales();
    }

    function exigirSesion() {
        if (!firebase.usuarioAutorizado()) {
            throw new Error(
                'Inicia sesión para sincronizar las rutas.'
            );
        }
    }

    function establecerOcupado(valor) {
        ocupado = valor;

        document.querySelectorAll(
            '#sync-panel button'
        ).forEach(boton => {
            boton.disabled = valor;
        });
    }

    async function ejecutar(accion) {
        if (ocupado) return;

        establecerOcupado(true);

        try {
            exigirSesion();
            await accion();
        } catch (error) {
            console.error('BIOGIRO Sync:', error);

            if (
                String(error.message).includes(
                    'CONFLICTO_REMOTO'
                )
            ) {
                cerrarConflicto();

                informar(
                    'La ruta cambió en Firebase durante la operación. ' +
                    'Consulta nuevamente y revisa las dos versiones.',
                    true
                );
            } else {
                informar(
                    error.message ||
                    'No fue posible completar la operación.',
                    true
                );
            }
        } finally {
            establecerOcupado(false);
        }
    }

    function crearInterfaz() {
        const historial = $('historial');

        if (!historial) {
            throw new Error(
                'No se encontró la vista del historial.'
            );
        }

        const panel = document.createElement('div');

        panel.id = 'sync-panel';
        panel.className = 'panel';

        panel.innerHTML = `
            <div class="section-heading">
                <div>
                    <h2>
                        <i class="bi bi-cloud-arrow-up"></i>
                        Rutas en la nube
                    </h2>
                    <p>
                        Sincronización manual con protección
                        contra sobrescrituras.
                    </p>
                </div>
            </div>

            <div class="sync-toolbar">
                <button
                    id="sync-consultar"
                    class="btn btn-success"
                    type="button"
                >
                    Consultar nube
                </button>

                <button
                    id="sync-actualizar-local"
                    class="btn btn-outline-success"
                    type="button"
                >
                    Actualizar rutas locales
                </button>
            </div>

            <p id="sync-estado" class="sync-estado">
                Esperando autenticación...
            </p>

            <div
                id="sync-conflicto"
                class="sync-conflicto"
                hidden
            >
                <h3>Conflicto entre versiones</h3>

                <p id="sync-conflicto-detalle"></p>

                <div class="sync-conflicto-botones">
                    <button
                        id="sync-mantener-local"
                        class="btn btn-outline-secondary"
                        type="button"
                    >
                        Conservar local
                    </button>

                    <button
                        id="sync-usar-nube"
                        class="btn btn-outline-primary"
                        type="button"
                    >
                        Recuperar Firebase
                    </button>

                    <button
                        id="sync-subir-copia"
                        class="btn btn-outline-success"
                        type="button"
                    >
                        Subir como copia
                    </button>

                    <button
                        id="sync-descargar-copia"
                        class="btn btn-outline-success"
                        type="button"
                    >
                        Descargar como copia
                    </button>

                    <button
                        id="sync-reemplazar-nube"
                        class="btn btn-outline-danger"
                        type="button"
                    >
                        Reemplazar Firebase
                    </button>
                </div>
            </div>

            <h3 class="sync-subtitulo">
                Rutas guardadas en este navegador
            </h3>

            <div class="table-responsive">
                <table class="table align-middle">
                    <thead>
                        <tr>
                            <th>Ruta</th>
                            <th>Fecha</th>
                            <th>Volumen</th>
                            <th>Acción</th>
                        </tr>
                    </thead>
                    <tbody id="sync-local"></tbody>
                </table>
            </div>

            <h3 class="sync-subtitulo">
                Rutas disponibles en Firestore
            </h3>

            <div class="table-responsive">
                <table class="table align-middle">
                    <thead>
                        <tr>
                            <th>Ruta</th>
                            <th>Fecha</th>
                            <th>Volumen</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="sync-nube"></tbody>
                </table>
            </div>

            <p
                id="sync-mensaje"
                class="small text-success"
                role="status"
                aria-live="polite"
            ></p>

            <div class="info-strip">
                <i class="bi bi-info-circle"></i>
                Los datos son simulaciones académicas.
                No representan recolecciones verificadas.
            </div>
        `;

        const estilos = document.createElement('style');

        estilos.textContent = `
            #sync-panel {
                margin-top: 24px;
            }

            #sync-panel [hidden] {
                display: none !important;
            }

            .sync-toolbar,
            .sync-conflicto-botones,
            .sync-acciones {
                display: flex;
                flex-wrap: wrap;
                gap: 9px;
            }

            .sync-toolbar {
                margin: 20px 0;
            }

            .sync-toolbar .btn,
            .sync-conflicto-botones .btn,
            .sync-acciones .btn {
                font-size: 12px;
            }

            .sync-subtitulo {
                margin: 26px 0 14px;
                color: #194b35;
                font-size: 16px;
                font-weight: 700;
            }

            .sync-estado {
                display: inline-block;
                padding: 8px 12px;
                border-radius: 8px;
                background: #eaf4ee;
                color: #225b3c;
                font-size: 12px;
            }

            .sync-conflicto {
                margin: 18px 0;
                padding: 18px;
                border: 1px solid #efc77c;
                border-radius: 12px;
                background: #fff9eb;
                color: #654b16;
            }

            .sync-conflicto h3 {
                margin: 0 0 10px;
                font-size: 17px;
                font-weight: 750;
            }

            .sync-conflicto p {
                margin: 0 0 15px;
                font-size: 13px;
                line-height: 1.6;
            }

            #sync-panel td,
            #sync-panel th {
                font-size: 12px;
            }

            #sync-panel td:last-child {
                min-width: 190px;
            }

            .sync-vacio {
                padding: 20px !important;
                text-align: center;
                color: #77867d;
            }

            #sync-mensaje {
                margin-top: 15px;
                overflow-wrap: anywhere;
            }
        `;

        document.head.appendChild(estilos);
        historial.appendChild(panel);
    }

    function mostrarLocales() {
        const tbody = $('sync-local');
        tbody.replaceChildren();

        const rutas = storage.listar();

        if (!rutas.length) {
            filaVacia(
                tbody,
                4,
                'No hay rutas locales guardadas.'
            );
            return;
        }

        rutas.forEach(ruta => {
            const fila = document.createElement('tr');

            celda(fila, ruta.nombre);
            celda(fila, ruta.fecha);
            celda(
                fila,
                `${volumen(ruta).toFixed(1)} L`
            );

            const acciones = document.createElement('td');

            acciones.appendChild(
                crearBoton(
                    'Subir a Firebase',
                    'btn-outline-success',
                    () => ejecutar(
                        () => subirRuta(ruta.id)
                    )
                )
            );

            fila.appendChild(acciones);
            tbody.appendChild(fila);
        });
    }

    function mostrarNube() {
        const tbody = $('sync-nube');
        tbody.replaceChildren();

        if (!consultaRealizada) {
            filaVacia(
                tbody,
                5,
                'Inicia sesión y pulsa "Consultar nube".'
            );
            return;
        }

        if (!rutasNube.length) {
            filaVacia(
                tbody,
                5,
                'No hay rutas guardadas en Firestore.'
            );
            return;
        }

        rutasNube.forEach(ruta => {
            const fila = document.createElement('tr');

            celda(fila, ruta.nombre ?? 'Sin nombre');
            celda(fila, ruta.fecha ?? 'Sin fecha');

            const litros = Array.isArray(ruta.paradas)
                ? ruta.paradas.reduce(
                    (total, parada) =>
                        total + (
                            Number.isFinite(parada?.litros)
                                ? parada.litros
                                : 0
                        ),
                    0
                )
                : 0;

            celda(fila, `${litros.toFixed(1)} L`);
            celda(fila, ruta.estado ?? 'Sin estado');

            const acciones = document.createElement('td');
            const grupo = document.createElement('div');

            grupo.className = 'sync-acciones';

            grupo.appendChild(
                crearBoton(
                    'Descargar',
                    'btn-outline-success',
                    () => ejecutar(
                        () => descargarRuta(ruta.id)
                    )
                )
            );

            grupo.appendChild(
                crearBoton(
                    'Eliminar nube',
                    'btn-outline-danger',
                    () => ejecutar(
                        () => eliminarRutaNube(ruta.id)
                    )
                )
            );

            acciones.appendChild(grupo);
            fila.appendChild(acciones);
            tbody.appendChild(fila);
        });
    }

    async function consultarNube() {
        const rutas = await firebase.obtenerRutas();

        rutas.sort((a, b) =>
            String(b.actualizadoEn ?? '').localeCompare(
                String(a.actualizadoEn ?? '')
            )
        );

        rutasNube = rutas;
        consultaRealizada = true;

        mostrarNube();

        informar(
            `${rutas.length} rutas consultadas en Firestore.`
        );
    }

    function cerrarConflicto() {
        conflictoActual = null;
        $('sync-conflicto').hidden = true;
        $('sync-conflicto-detalle').textContent = '';
    }

    function abrirConflicto(local, nube) {
        validarRuta(local);
        validarRuta(nube);

        conflictoActual = {
            id: local.id,
            firmaLocal: datosComparables(local),
            firmaNube: firebase.firmaRuta(nube)
        };

        const detalle = $('sync-conflicto-detalle');

        detalle.textContent =
            `Existen dos versiones diferentes de esta ruta. ` +
            `Local: "${local.nombre}" ` +
            `(${volumen(local).toFixed(1)} L). ` +
            `Firebase: "${nube.nombre}" ` +
            `(${volumen(nube).toFixed(1)} L). ` +
            `Elige cómo deseas resolver el conflicto.`;

        $('sync-conflicto').hidden = false;

        $('sync-conflicto').scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });

        informar(
            'Se detectaron versiones diferentes. ' +
            'No se ha sobrescrito ninguna.'
        );
    }

    async function obtenerConflictoVigente() {
        if (!conflictoActual) {
            throw new Error(
                'No hay un conflicto seleccionado.'
            );
        }

        const local = storage.buscar(conflictoActual.id);
        const nube = await firebase.obtenerRuta(
            conflictoActual.id
        );

        if (!local || !nube) {
            cerrarConflicto();

            throw new Error(
                'Una de las versiones ya no existe. ' +
                'Consulta nuevamente.'
            );
        }

        validarRuta(local);
        validarRuta(nube);

        if (
            datosComparables(local) !==
                conflictoActual.firmaLocal ||
            firebase.firmaRuta(nube) !==
                conflictoActual.firmaNube
        ) {
            cerrarConflicto();

            throw new Error(
                'Una versión cambió después de abrir el conflicto. ' +
                'Revisa las rutas nuevamente.'
            );
        }

        return { local, nube };
    }

    async function subirRuta(id) {
        cerrarConflicto();

        const local = storage.buscar(id);

        if (!local) {
            throw new Error('La ruta local ya no existe.');
        }

        validarRuta(local);

        const nube = await firebase.obtenerRuta(id);

        if (nube) {
            validarRuta(nube);

            if (contenidoIgual(local, nube)) {
                informar(
                    'La ruta ya tiene el mismo contenido ' +
                    'en Firebase y en este navegador.'
                );
                return;
            }

            abrirConflicto(local, nube);
            return;
        }

        await firebase.guardarRutaSegura(local, null);
        await consultarNube();

        informar(
            `Ruta "${local.nombre}" subida correctamente.`
        );
    }

    async function descargarRuta(id) {
        cerrarConflicto();

        const nube = await firebase.obtenerRuta(id);

        if (!nube) {
            throw new Error(
                'La ruta ya no existe en Firebase.'
            );
        }

        validarRuta(nube);

        const local = storage.buscar(id);

        if (local) {
            validarRuta(local);

            if (contenidoIgual(local, nube)) {
                informar(
                    'Esta ruta ya está disponible localmente ' +
                    'con el mismo contenido.'
                );
                return;
            }

            abrirConflicto(local, nube);
            return;
        }

        guardarEnLocal(nube);

        informar(
            `Ruta "${nube.nombre}" descargada correctamente. ` +
            'Vuelve a entrar al historial para actualizar su tabla.'
        );
    }

    async function conservarLocal() {
        const { local } = await obtenerConflictoVigente();

        cerrarConflicto();

        informar(
            `Se conservó "${local.nombre}" en el navegador. ` +
            'Firebase no fue modificado.'
        );
    }

    async function recuperarFirebase() {
        const { nube } = await obtenerConflictoVigente();

        const confirmar = window.confirm(
            'Esta acción reemplazará la ruta local por ' +
            'la versión de Firebase.\n\n' +
            'Ya tienes un respaldo JSON. ¿Continuar?'
        );

        if (!confirmar) return;

        guardarEnLocal(nube);
        cerrarConflicto();

        informar(
            'La versión de Firebase reemplazó la ruta local. ' +
            'La copia remota no cambió.'
        );
    }

    async function subirComoCopia() {
        const { local } = await obtenerConflictoVigente();
        const copia = copiaRuta(local);

        validarRuta(copia);

        await firebase.guardarRutaSegura(copia, null);
        await consultarNube();

        cerrarConflicto();

        informar(
            `Se guardó "${copia.nombre}" en Firebase ` +
            'con un identificador nuevo. Ambas versiones se conservaron.'
        );
    }

    async function descargarComoCopia() {
        const { nube } = await obtenerConflictoVigente();
        const copia = copiaRuta(nube);

        validarRuta(copia);
        guardarEnLocal(copia);

        cerrarConflicto();

        informar(
            `Se guardó "${copia.nombre}" como ruta local ` +
            'independiente. Ambas versiones se conservaron.'
        );
    }

    async function reemplazarFirebase() {
        const { local, nube } =
            await obtenerConflictoVigente();

        const confirmar = window.confirm(
            `Vas a reemplazar "${nube.nombre}" en Firebase ` +
            `por "${local.nombre}".\n\n` +
            'La versión remota anterior dejará de existir ' +
            'con ese identificador.\n\n' +
            '¿Confirmas esta operación?'
        );

        if (!confirmar) return;

        await firebase.guardarRutaSegura(
            local,
            conflictoActual.firmaNube
        );

        cerrarConflicto();
        await consultarNube();

        informar(
            'La versión local reemplazó correctamente ' +
            'el documento de Firebase.'
        );
    }

    async function eliminarRutaNube(id) {
        cerrarConflicto();

        const nube = await firebase.obtenerRuta(id);

        if (!nube) {
            throw new Error(
                'La ruta ya no existe en Firebase.'
            );
        }

        const confirmar = window.confirm(
            `¿Eliminar "${nube.nombre}" de Firebase?\n\n` +
            'La copia local, si existe, no será eliminada.'
        );

        if (!confirmar) return;

        await firebase.eliminarRutaSegura(
            id,
            firebase.firmaRuta(nube)
        );

        await consultarNube();

        informar(
            `Ruta "${nube.nombre}" eliminada de Firebase.`
        );
    }

    function actualizarSesion() {
        const conectado = firebase.usuarioAutorizado();

        $('sync-estado').textContent = conectado
            ? '● Firebase conectado: sincronización disponible'
            : '● Modo local: inicia sesión para sincronizar';

        if (!conectado) {
            rutasNube = [];
            consultaRealizada = false;

            cerrarConflicto();
            mostrarNube();
        }

        mostrarLocales();
    }

    function conectarEventos() {
        $('sync-consultar').addEventListener(
            'click',
            () => ejecutar(consultarNube)
        );

        $('sync-actualizar-local').addEventListener(
            'click',
            () => {
                try {
                    mostrarLocales();
                    informar('Listado local actualizado.');
                } catch (error) {
                    informar(error.message, true);
                }
            }
        );

        $('sync-mantener-local').addEventListener(
            'click',
            () => ejecutar(conservarLocal)
        );

        $('sync-usar-nube').addEventListener(
            'click',
            () => ejecutar(recuperarFirebase)
        );

        $('sync-subir-copia').addEventListener(
            'click',
            () => ejecutar(subirComoCopia)
        );

        $('sync-descargar-copia').addEventListener(
            'click',
            () => ejecutar(descargarComoCopia)
        );

        $('sync-reemplazar-nube').addEventListener(
            'click',
            () => ejecutar(reemplazarFirebase)
        );

        document.addEventListener(
            'biogiro:sesion',
            actualizarSesion
        );

        actualizarSesion();
    }

    crearInterfaz();
    conectarEventos();
    mostrarNube();

    console.log(
        'BIOGIRO v2.6: sincronización protegida inicializada.'
    );
})();
