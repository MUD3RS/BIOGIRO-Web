
'use strict';

/*
 * BIOGIRO v2.5
 * Interfaz de historial de recolecciones.
 * Circular Nexum Industries.
 *
 * Los registros representan una simulación académica.
 */

(() => {
    const storage = window.BIOGIROStorage;

    if (!storage) {
        console.error('BIOGIROStorage no está disponible.');
        return;
    }

    let rutaEnEdicion = null;

    const elemento = id => document.getElementById(id);

    function notificar(texto, error = false) {
        const aviso = elemento('app-notice');

        aviso.textContent = texto;
        aviso.classList.toggle('error', error);
        aviso.hidden = false;
    }

    function crearInterfaz() {
        const menu = document.querySelector('.sidebar-nav');
        const referencia = menu.querySelector(
            '[data-view="analisis"]'
        );

        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'nav-link';
        boton.dataset.view = 'historial';

        boton.innerHTML = `
            <i class="bi bi-clock-history"></i>
            <span>Historial de recolecciones</span>
        `;

        menu.insertBefore(boton, referencia);

        const vista = document.createElement('section');
        vista.className = 'app-view';
        vista.id = 'historial';
        vista.dataset.title = 'Historial de recolecciones';
        vista.dataset.description =
            'Consulta y administra las rutas guardadas.';

        vista.innerHTML = `
            <div class="welcome-banner historial-banner">
                <div>
                    <span class="banner-kicker">
                        GESTIÓN DE OPERACIONES
                    </span>
                    <h2>Historial de recolecciones</h2>
                    <p>
                        Guarda, recupera y administra las rutas
                        extraordinarias de BIOGIRO.
                    </p>
                </div>
                <i class="bi bi-clock-history banner-symbol"></i>
            </div>

            <div class="stats-grid">
                <article class="stat-card">
                    <span class="stat-icon green">
                        <i class="bi bi-journal-check"></i>
                    </span>
                    <div>
                        <p>Rutas guardadas</p>
                        <strong id="hist-total">0</strong>
                        <small>Registros locales</small>
                    </div>
                </article>

                <article class="stat-card">
                    <span class="stat-icon amber">
                        <i class="bi bi-hourglass-split"></i>
                    </span>
                    <div>
                        <p>Pendientes</p>
                        <strong id="hist-pendientes">0</strong>
                        <small>Sin planificar</small>
                    </div>
                </article>

                <article class="stat-card">
                    <span class="stat-icon blue">
                        <i class="bi bi-check-circle"></i>
                    </span>
                    <div>
                        <p>Completadas</p>
                        <strong id="hist-completadas">0</strong>
                        <small>Estado de simulación</small>
                    </div>
                </article>
            </div>

            <div class="panel">
                <div class="section-heading">
                    <div>
                        <h2>Registrar ruta manual</h2>
                        <p>
                            Prepara primero una ruta en
                            Gestión de rutas.
                        </p>
                    </div>
                </div>

                <form id="form-guardar-ruta">
                    <div class="row g-3">
                        <div class="col-md-6">
                            <label class="form-label"
                                   for="hist-nombre">
                                Nombre de la ruta
                            </label>
                            <input
                                id="hist-nombre"
                                class="form-control"
                                maxlength="100"
                                placeholder="Ej. Recolección zona centro"
                                required
                            >
                        </div>

                        <div class="col-md-3">
                            <label class="form-label"
                                   for="hist-fecha">
                                Fecha programada
                            </label>
                            <input
                                id="hist-fecha"
                                type="date"
                                class="form-control"
                                required
                            >
                        </div>

                        <div class="col-md-3">
                            <label class="form-label"
                                   for="hist-estado">
                                Estado
                            </label>
                            <select id="hist-estado"
                                    class="form-select">
                                <option value="pendiente">
                                    Pendiente
                                </option>
                                <option value="planificada">
                                    Planificada
                                </option>
                                <option value="completada">
                                    Completada
                                </option>
                            </select>
                        </div>

                        <div class="col-12">
                            <label class="form-label"
                                   for="hist-notas">
                                Observaciones
                            </label>
                            <textarea
                                id="hist-notas"
                                class="form-control"
                                maxlength="500"
                                rows="2"
                                placeholder="Observaciones de la simulación..."
                            ></textarea>
                        </div>
                    </div>

                    <div class="hist-toolbar">
                        <button type="submit"
                                class="btn btn-success">
                            <i class="bi bi-floppy"></i>
                            Guardar ruta manual
                        </button>

                        <button type="button"
                                id="hist-nueva"
                                class="btn btn-outline-secondary">
                            Nuevo registro
                        </button>

                        <button type="button"
                                id="hist-ir-manual"
                                class="btn btn-outline-success">
                            <i class="bi bi-sliders"></i>
                            Preparar ruta
                        </button>
                    </div>

                    <p id="hist-edicion"
                       class="hist-edicion"
                       hidden></p>
                </form>
            </div>

            <div class="panel">
                <div class="section-heading">
                    <div>
                        <h2>Rutas registradas</h2>
                        <p>
                            Datos guardados únicamente en
                            este navegador.
                        </p>
                    </div>
                </div>

                <div class="hist-toolbar">
                    <button type="button"
                            id="hist-exportar"
                            class="btn btn-outline-success">
                        <i class="bi bi-download"></i>
                        Exportar respaldo JSON
                    </button>

                    <button type="button"
                            id="hist-importar"
                            class="btn btn-outline-secondary">
                        <i class="bi bi-upload"></i>
                        Importar respaldo JSON
                    </button>

                    <input
                        type="file"
                        id="hist-archivo"
                        accept=".json,application/json"
                        hidden
                    >
                </div>

                <div class="table-responsive">
                    <table class="table align-middle">
                        <thead>
                            <tr>
                                <th>Ruta</th>
                                <th>Fecha</th>
                                <th>Paradas</th>
                                <th>Volumen</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody id="hist-tabla"></tbody>
                    </table>
                </div>
            </div>

            <div class="info-strip">
                <i class="bi bi-info-circle"></i>
                Las rutas guardadas son registros de
                simulación académica. El estado
                "Completada" no acredita una recolección real.
            </div>
        `;

        document.querySelector('.main-content')
            .appendChild(vista);

        const estilos = document.createElement('style');

        estilos.textContent = `
            .historial-banner {
                min-height: 170px;
            }

            .hist-toolbar {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin: 22px 0;
            }

            .hist-toolbar .btn {
                font-size: 12px;
                padding: 10px 15px;
            }

            .hist-edicion {
                margin: 12px 0 0;
                color: #23844c;
                font-size: 13px;
                font-weight: 700;
            }

            .hist-acciones {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                min-width: 170px;
            }

            .hist-acciones .btn {
                font-size: 11px;
                padding: 6px 9px;
            }

            .hist-estado {
                display: inline-block;
                padding: 5px 9px;
                border-radius: 20px;
                font-size: 11px;
                font-weight: 700;
                background: #edf2f7;
                color: #40536b;
            }

            .hist-estado.planificada {
                background: #e5f0ff;
                color: #235b9d;
            }

            .hist-estado.completada {
                background: #e5f5eb;
                color: #207b42;
            }

            .hist-vacio {
                padding: 28px 10px !important;
                text-align: center;
                color: #718077;
            }

            @media (max-width: 760px) {
                .historial-banner {
                    min-height: 150px;
                }
            }
        `;

        document.head.appendChild(estilos);

        boton.addEventListener('click', () => {
            navegar('historial');
            actualizarHistorial();
        });
    }

    function fechaLocal() {
        const fecha = new Date();
        const anio = fecha.getFullYear();
        const mes = String(
            fecha.getMonth() + 1
        ).padStart(2, '0');
        const dia = String(
            fecha.getDate()
        ).padStart(2, '0');

        return `${anio}-${mes}-${dia}`;
    }

    function nuevoRegistro() {
        rutaEnEdicion = null;

        elemento('form-guardar-ruta').reset();
        elemento('hist-fecha').value = fechaLocal();
        elemento('hist-edicion').hidden = true;
    }

    function guardarRuta(evento) {
        evento.preventDefault();

        if (typeof manual === 'undefined') {
            notificar(
                'No está disponible la selección manual.',
                true
            );
            return;
        }

        const paradas = [...manual.entries()].map(
            ([id_denue, litros]) => ({
                id_denue,
                litros: Number(litros)
            })
        );

        if (!paradas.length) {
            notificar(
                'Primero selecciona establecimientos ' +
                'en Gestión de rutas > Rutas manuales.',
                true
            );
            return;
        }

        const idsConocidos = new Set(
            establecimientos.map(
                p => String(p.id_denue)
            )
        );

        if (paradas.some(
            p => !idsConocidos.has(p.id_denue)
        )) {
            notificar(
                'Hay establecimientos que no existen ' +
                'en el directorio actual.',
                true
            );
            return;
        }

        try {
            const guardada = storage.guardar({
                id: rutaEnEdicion,
                nombre: elemento('hist-nombre').value,
                fecha: elemento('hist-fecha').value,
                estado: elemento('hist-estado').value,
                notas: elemento('hist-notas').value,
                paradas
            });

            rutaEnEdicion = guardada.id;

            elemento('hist-edicion').hidden = false;
            elemento('hist-edicion').textContent =
                `Editando: ${guardada.nombre}`;

            actualizarHistorial();
            notificar('Ruta guardada correctamente.');

        } catch (error) {
            notificar(error.message, true);
        }
    }

    function cargarRuta(id) {
        try {
            const ruta = storage.buscar(id);

            if (!ruta) {
                throw new Error(
                    'La ruta seleccionada ya no existe.'
                );
            }

            const catalogo = new Set(
                establecimientos.map(
                    p => String(p.id_denue)
                )
            );

            const faltantes = ruta.paradas.filter(
                p => !catalogo.has(p.id_denue)
            );

            if (faltantes.length) {
                throw new Error(
                    'No se puede cargar esta ruta porque ' +
                    'algunos establecimientos ya no existen ' +
                    'en el directorio.'
                );
            }

            manual.clear();

            ruta.paradas.forEach(parada => {
                manual.set(
                    parada.id_denue,
                    parada.litros
                );
            });

            sincronizarSeleccionManual();
            mostrarTablaManual();
            cambiarPestana('manual');

            rutaEnEdicion = ruta.id;

            elemento('hist-nombre').value = ruta.nombre;
            elemento('hist-fecha').value = ruta.fecha;
            elemento('hist-estado').value = ruta.estado;
            elemento('hist-notas').value = ruta.notas;

            elemento('hist-edicion').hidden = false;
            elemento('hist-edicion').textContent =
                `Editando: ${ruta.nombre}`;

            navegar('rutas');

            notificar(
                'Ruta recuperada. Puedes editar sus ' +
                'establecimientos y volúmenes.'
            );

        } catch (error) {
            notificar(error.message, true);
        }
    }

    function agregarCelda(fila, texto) {
        const celda = document.createElement('td');
        celda.textContent = String(texto);
        fila.appendChild(celda);
        return celda;
    }

    function agregarBoton(contenedor, texto, clase, accion) {
        const boton = document.createElement('button');

        boton.type = 'button';
        boton.className = `btn ${clase}`;
        boton.textContent = texto;
        boton.addEventListener('click', accion);

        contenedor.appendChild(boton);
    }

    function actualizarHistorial() {
        const tbody = elemento('hist-tabla');
        tbody.replaceChildren();

        try {
            const rutas = storage.listar();
            const estadisticas = storage.estadisticas();

            elemento('hist-total').textContent =
                estadisticas.total;

            elemento('hist-pendientes').textContent =
                estadisticas.pendientes;

            elemento('hist-completadas').textContent =
                estadisticas.completadas;

            if (!rutas.length) {
                const fila = document.createElement('tr');
                const celda = document.createElement('td');

                celda.colSpan = 6;
                celda.className = 'hist-vacio';
                celda.textContent =
                    'Todavía no hay rutas guardadas.';

                fila.appendChild(celda);
                tbody.appendChild(fila);
                return;
            }

            rutas.forEach(ruta => {
                const fila = document.createElement('tr');

                agregarCelda(fila, ruta.nombre);
                agregarCelda(fila, ruta.fecha);

                agregarCelda(
                    fila,
                    ruta.paradas.length
                );

                const litros = ruta.paradas.reduce(
                    (total, p) => total + p.litros,
                    0
                );

                agregarCelda(
                    fila,
                    `${litros.toFixed(1)} L`
                );

                const celdaEstado =
                    document.createElement('td');

                const selector =
                    document.createElement('select');

                selector.className =
                    'form-select form-select-sm';

                [
                    'pendiente',
                    'planificada',
                    'completada'
                ].forEach(estado => {
                    const opcion =
                        document.createElement('option');

                    opcion.value = estado;
                    opcion.textContent =
                        estado.charAt(0).toUpperCase() +
                        estado.slice(1);

                    selector.appendChild(opcion);
                });

                selector.value = ruta.estado;

                selector.addEventListener('change', () => {
                    try {
                        storage.cambiarEstado(
                            ruta.id,
                            selector.value
                        );

                        actualizarHistorial();

                        notificar(
                            'Estado de la simulación actualizado.'
                        );
                    } catch (error) {
                        actualizarHistorial();
                        notificar(error.message, true);
                    }
                });

                celdaEstado.appendChild(selector);
                fila.appendChild(celdaEstado);

                const celdaAcciones =
                    document.createElement('td');

                const acciones =
                    document.createElement('div');

                acciones.className = 'hist-acciones';

                agregarBoton(
                    acciones,
                    'Cargar / editar',
                    'btn-outline-success',
                    () => cargarRuta(ruta.id)
                );

                agregarBoton(
                    acciones,
                    'Eliminar',
                    'btn-outline-danger',
                    () => {
                        const confirmar = window.confirm(
                            `¿Eliminar la ruta "${ruta.nombre}"?`
                        );

                        if (!confirmar) return;

                        try {
                            storage.eliminar(ruta.id);

                            if (rutaEnEdicion === ruta.id) {
                                nuevoRegistro();
                            }

                            actualizarHistorial();
                            notificar('Ruta eliminada.');
                        } catch (error) {
                            notificar(error.message, true);
                        }
                    }
                );

                celdaAcciones.appendChild(acciones);
                fila.appendChild(celdaAcciones);

                tbody.appendChild(fila);
            });

        } catch (error) {
            notificar(error.message, true);
        }
    }

    function descargarRespaldo() {
        try {
            const contenido = storage.exportar();

            const blob = new Blob(
                [contenido],
                { type: 'application/json;charset=utf-8' }
            );

            const url = URL.createObjectURL(blob);
            const enlace = document.createElement('a');

            enlace.href = url;
            enlace.download =
                `BIOGIRO_respaldo_${fechaLocal()}.json`;

            document.body.appendChild(enlace);
            enlace.click();
            enlace.remove();

            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 1000);

            notificar('Respaldo JSON generado.');

        } catch (error) {
            notificar(error.message, true);
        }
    }

    async function importarRespaldo(evento) {
        const archivo = evento.target.files[0];

        if (!archivo) return;

        try {
            if (archivo.size > 2 * 1024 * 1024) {
                throw new Error(
                    'El respaldo supera el límite de 2 MB.'
                );
            }

            const texto = await archivo.text();

            const confirmar = window.confirm(
                'Se combinarán las rutas del archivo con ' +
                'las existentes. Las rutas con el mismo ' +
                'identificador serán actualizadas. ' +
                '¿Deseas continuar?'
            );

            if (!confirmar) return;

            const resultado = storage.importar(
                texto,
                'combinar'
            );

            nuevoRegistro();
            actualizarHistorial();

            notificar(
                `${resultado.importadas} rutas importadas. ` +
                `Total actual: ${resultado.total}.`
            );

        } catch (error) {
            notificar(error.message, true);
        } finally {
            evento.target.value = '';
        }
    }

    function conectarEventos() {
        elemento('form-guardar-ruta')
            .addEventListener('submit', guardarRuta);

        elemento('hist-nueva')
            .addEventListener('click', nuevoRegistro);

        elemento('hist-ir-manual')
            .addEventListener('click', () => {
                cambiarPestana('manual');
                navegar('rutas');
            });

        elemento('hist-exportar')
            .addEventListener('click', descargarRespaldo);

        elemento('hist-importar')
            .addEventListener('click', () => {
                elemento('hist-archivo').click();
            });

        elemento('hist-archivo')
            .addEventListener('change', importarRespaldo);
    }

    crearInterfaz();
    conectarEventos();
    nuevoRegistro();
    actualizarHistorial();

    console.log(
        'BIOGIRO v2.5: módulo de historial inicializado.'
    );
})();
