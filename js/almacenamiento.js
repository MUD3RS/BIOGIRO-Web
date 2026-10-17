
'use strict';

/*
 * BIOGIRO v2.5
 * Circular Nexum Industries
 * Persistencia local de rutas de recolección.
 *
 * Los registros son parte de una simulación académica.
 */

window.BIOGIROStorage = (() => {
    const CLAVE = 'biogiro_rutas_v25';
    const VERSION = 1;
    const LIMITE_RUTAS = 500;
    const LIMITE_PARADAS = 25;
    const CAPACIDAD = 300;

    const ESTADOS = [
        'pendiente',
        'planificada',
        'completada'
    ];

    function obtenerDatos() {
        try {
            const texto = localStorage.getItem(CLAVE);

            if (!texto) {
                return [];
            }

            const datos = JSON.parse(texto);

            if (!Array.isArray(datos)) {
                throw new Error(
                    'El historial almacenado no es válido.'
                );
            }

            return validarColeccion(datos);
        } catch (error) {
            console.error('BIOGIRO Storage:', error);
            throw new Error(
                'No se pudo leer el historial local. ' +
                'Los datos existentes no se modificaron.'
            );
        }
    }

    function guardarDatos(registros) {
        const validados = validarColeccion(registros);

        try {
            localStorage.setItem(
                CLAVE,
                JSON.stringify(validados)
            );
        } catch (error) {
            console.error('BIOGIRO Storage:', error);

            throw new Error(
                'No fue posible guardar los cambios. ' +
                'Comprueba el almacenamiento del navegador.'
            );
        }

        return validados;
    }

    function validarTexto(valor, campo, maximo = 120) {
        if (
            typeof valor !== 'string' ||
            !valor.trim() ||
            valor.length > maximo
        ) {
            throw new Error(
                `El campo "${campo}" no es válido.`
            );
        }

        return valor.trim();
    }

    function validarFecha(valor, campo) {
        if (
            typeof valor !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(valor)
        ) {
            throw new Error(
                `La fecha de "${campo}" no es válida.`
            );
        }

        const fecha = new Date(`${valor}T12:00:00Z`);

        if (
            Number.isNaN(fecha.getTime()) ||
            fecha.toISOString().slice(0, 10) !== valor
        ) {
            throw new Error(
                `La fecha de "${campo}" no existe.`
            );
        }

        return valor;
    }

    function validarParadas(paradas) {
        if (
            !Array.isArray(paradas) ||
            paradas.length < 1 ||
            paradas.length > LIMITE_PARADAS
        ) {
            throw new Error(
                'La ruta debe contener entre 1 y 25 paradas.'
            );
        }

        const ids = new Set();
        let total = 0;

        const resultado = paradas.map(parada => {
            if (
                !parada ||
                typeof parada !== 'object' ||
                Array.isArray(parada)
            ) {
                throw new Error(
                    'Se encontró una parada inválida.'
                );
            }

            const id = validarTexto(
                String(parada.id_denue ?? ''),
                'ID DENUE',
                80
            );

            if (ids.has(id)) {
                throw new Error(
                    'La ruta contiene establecimientos duplicados.'
                );
            }

            ids.add(id);

            const litros = Number(parada.litros);

            if (
                !Number.isFinite(litros) ||
                litros <= 0 ||
                litros > CAPACIDAD
            ) {
                throw new Error(
                    'Cada parada debe tener un volumen ' +
                    'mayor que 0 y de máximo 300 L.'
                );
            }

            total += litros;

            return {
                id_denue: id,
                litros: Math.round(litros * 100) / 100
            };
        });

        if (total > CAPACIDAD + 0.000001) {
            throw new Error(
                'La ruta supera la capacidad de 300 L.'
            );
        }

        return resultado;
    }

    function validarRegistro(registro) {
        if (
            !registro ||
            typeof registro !== 'object' ||
            Array.isArray(registro)
        ) {
            throw new Error('El registro de ruta es inválido.');
        }

        const estado = validarTexto(
            registro.estado,
            'estado',
            30
        );

        if (!ESTADOS.includes(estado)) {
            throw new Error(
                'El estado de la ruta no está permitido.'
            );
        }

        return {
            id: validarTexto(
                registro.id,
                'identificador',
                100
            ),
            nombre: validarTexto(
                registro.nombre,
                'nombre',
                100
            ),
            fecha: validarFecha(
                registro.fecha,
                'recolección'
            ),
            estado,
            notas: typeof registro.notas === 'string'
                ? registro.notas.slice(0, 500)
                : '',
            paradas: validarParadas(registro.paradas),
            creadoEn: validarTexto(
                registro.creadoEn,
                'fecha de creación',
                40
            ),
            actualizadoEn: validarTexto(
                registro.actualizadoEn,
                'fecha de actualización',
                40
            ),
            simulacion: true
        };
    }

    function validarColeccion(registros) {
        if (
            !Array.isArray(registros) ||
            registros.length > LIMITE_RUTAS
        ) {
            throw new Error(
                'La colección de rutas excede el límite permitido.'
            );
        }

        const ids = new Set();

        return registros.map(registro => {
            const validado = validarRegistro(registro);

            if (ids.has(validado.id)) {
                throw new Error(
                    'El historial contiene identificadores duplicados.'
                );
            }

            ids.add(validado.id);

            return validado;
        });
    }

    function generarId() {
        if (
            window.crypto &&
            typeof window.crypto.randomUUID === 'function'
        ) {
            return window.crypto.randomUUID();
        }

        return (
            'ruta-' +
            Date.now() +
            '-' +
            Math.random().toString(36).slice(2, 12)
        );
    }

    function listar() {
        return obtenerDatos().sort(
            (a, b) =>
                b.actualizadoEn.localeCompare(a.actualizadoEn)
        );
    }

    function buscar(id) {
        return obtenerDatos().find(
            registro => registro.id === id
        ) || null;
    }

    function guardar(datos) {
        const registros = obtenerDatos();
        const ahora = new Date().toISOString();

        const indice = datos.id
            ? registros.findIndex(r => r.id === datos.id)
            : -1;

        if (
            datos.id &&
            indice === -1
        ) {
            throw new Error(
                'No se encontró la ruta que deseas editar.'
            );
        }

        const anterior = indice >= 0
            ? registros[indice]
            : null;

        const registro = validarRegistro({
            id: anterior ? anterior.id : generarId(),
            nombre: datos.nombre,
            fecha: datos.fecha,
            estado: datos.estado || 'pendiente',
            notas: datos.notas || '',
            paradas: datos.paradas,
            creadoEn: anterior ? anterior.creadoEn : ahora,
            actualizadoEn: ahora
        });

        if (indice >= 0) {
            registros[indice] = registro;
        } else {
            registros.push(registro);
        }

        guardarDatos(registros);

        return registro;
    }

    function cambiarEstado(id, nuevoEstado) {
        if (!ESTADOS.includes(nuevoEstado)) {
            throw new Error('Estado no permitido.');
        }

        const registros = obtenerDatos();
        const registro = registros.find(r => r.id === id);

        if (!registro) {
            throw new Error('No se encontró la ruta.');
        }

        registro.estado = nuevoEstado;
        registro.actualizadoEn = new Date().toISOString();

        guardarDatos(registros);

        return registro;
    }

    function eliminar(id) {
        const registros = obtenerDatos();

        const restantes = registros.filter(
            registro => registro.id !== id
        );

        if (restantes.length === registros.length) {
            throw new Error('No se encontró la ruta.');
        }

        guardarDatos(restantes);

        return true;
    }

    function exportar() {
        return JSON.stringify({
            aplicacion: 'BIOGIRO',
            versionFormato: VERSION,
            tipo: 'respaldo-rutas',
            simulacion: true,
            exportadoEn: new Date().toISOString(),
            rutas: obtenerDatos()
        }, null, 2);
    }

    function importar(texto, modo = 'combinar') {
        let archivo;

        try {
            archivo = JSON.parse(texto);
        } catch {
            throw new Error(
                'El archivo no contiene un JSON válido.'
            );
        }

        if (
            !archivo ||
            archivo.aplicacion !== 'BIOGIRO' ||
            archivo.versionFormato !== VERSION ||
            archivo.tipo !== 'respaldo-rutas' ||
            archivo.simulacion !== true
        ) {
            throw new Error(
                'El archivo no corresponde a un respaldo ' +
                'compatible de BIOGIRO v2.5.'
            );
        }

        const importadas = validarColeccion(archivo.rutas);

        if (!['combinar', 'reemplazar'].includes(modo)) {
            throw new Error(
                'El modo de importación no está permitido.'
            );
        }

        let resultado;

        if (modo === 'reemplazar') {
            resultado = importadas;
        } else {
            const existentes = obtenerDatos();

            const mapa = new Map(
                existentes.map(ruta => [ruta.id, ruta])
            );

            importadas.forEach(ruta => {
                mapa.set(ruta.id, ruta);
            });

            resultado = [...mapa.values()];
        }

        guardarDatos(resultado);

        return {
            importadas: importadas.length,
            total: resultado.length,
            modo
        };
    }

    function estadisticas() {
        const registros = obtenerDatos();

        return {
            total: registros.length,
            pendientes: registros.filter(
                r => r.estado === 'pendiente'
            ).length,
            planificadas: registros.filter(
                r => r.estado === 'planificada'
            ).length,
            completadas: registros.filter(
                r => r.estado === 'completada'
            ).length
        };
    }

    return Object.freeze({
        listar,
        buscar,
        guardar,
        cambiarEstado,
        eliminar,
        exportar,
        importar,
        estadisticas
    });
})();
