# AUX Cloud (AC Freedom)

Controle sus aires acondicionados y bombas de calor **AUX** desde Gladys, a
través de la nube AUX que utiliza la aplicación móvil **AC Freedom**. Todos
los equipos emparejados en la aplicación (incluidos los que otras cuentas
comparten con usted) aparecen en Gladys.

> La integración usa únicamente la nube de AUX: sus equipos y Gladys necesitan
> conexión a Internet. AUX no publica ninguna API oficial: la integración
> habla el protocolo de la aplicación AC Freedom, tal como lo analizó el
> proyecto [ha-aux-cloud](https://github.com/maeek/ha-aux-cloud).

## Antes de empezar

1. Empareje sus equipos en la aplicación **AC Freedom** y compruebe que puede
   controlarlos desde ella.
2. Recomendado: cree una **segunda cuenta AC Freedom** para Gladys y comparta
   sus equipos con ella desde la aplicación (_Equipo → Compartir_). La nube AUX
   mantiene una sola sesión por cuenta: con una cuenta dedicada, Gladys nunca
   cierra la sesión de su teléfono (y viceversa).

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. Introduzca el **correo electrónico o teléfono** y la **contraseña** de la
   cuenta.
3. Elija la **región de la nube** en la que se creó su cuenta: _Europa_ para la
   mayoría de usuarios europeos, si no _Estados Unidos_, _China_ o _Rusia_.
   Una región incorrecta parece una contraseña incorrecta.
4. El **intervalo de actualización** fija la frecuencia de lectura de los
   equipos en la nube (60 segundos por defecto, 30 segundos como mínimo). Los
   cambios hechos con el mando o la aplicación llegan a Gladys en la siguiente
   actualización; los comandos enviados desde Gladys se aplican al instante.
5. Guarde y pulse **Probar la conexión**: se muestra el número de equipos
   encontrados. Abra la pestaña **Descubrimiento** y añada sus equipos.

## Qué obtiene

**Aires acondicionados**

| Función                                                                                                   | Notas                                                                                           |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Encendido                                                                                                 | encendido / apagado                                                                             |
| Modo                                                                                                      | auto, frío, calor, deshumidificación, ventilación                                               |
| Temperatura objetivo                                                                                      | de 16 a 32 °C, en medios grados                                                                 |
| Velocidad del ventilador                                                                                  | auto, silencio, baja, media, alta, turbo (y las velocidades intermedias si el equipo las tiene) |
| Oscilación vertical / horizontal                                                                          | si el equipo lo permite                                                                         |
| Temperatura de la sala                                                                                    | medida por la unidad interior                                                                   |
| Eco, sueño, pantalla, salud, calor auxiliar, autolimpieza, bloqueo infantil, antimoho, viento confortable | solo las que su equipo informa                                                                  |

**Bombas de calor**: calefacción encendida/apagada y temperatura objetivo,
agua caliente encendida/apagada, temperaturas objetivo y del depósito, agua
caliente rápida, modos silencio y eco.

Cada equipo lleva una insignia **nube**, que pasa a **inaccesible** cuando el
equipo está desconectado de la nube AUX.

## Escenas

La integración añade sus propias tarjetas al editor de escenas (Gladys 5.1 o
posterior), en la categoría **Integraciones**.

Disparadores:

- **Equipo AUX encendido o apagado** — desde Gladys, el mando o la aplicación.
  Opcionalmente elija el equipo y el nuevo estado. El nuevo estado está
  disponible como `{{triggerEvent.data.state}}` (`on` / `off`).
- **Equipo AUX informa de un error** — el equipo activó su indicador de error;
  el código está disponible como `{{triggerEvent.data.error_code}}`.
- **Equipo AUX en línea o sin conexión** — un equipo perdió o recuperó su
  conexión.

Acciones:

- **Ajustar un aire acondicionado** — encendido, modo, temperatura objetivo y
  ventilador en un solo comando. Los campos vacíos no se modifican. Indica si
  se envió un comando.
- **Ajustar agua caliente (bomba)** — agua caliente encendida/apagada,
  consigna y calentamiento rápido.
- **Apagar todos los equipos AUX** — p. ej. cuando la última persona sale de
  casa. Indica el número de equipos apagados.

Las tarjetas estándar de Gladys (ajustar el valor de un dispositivo,
disparador «estado de un dispositivo»...) también funcionan con todas las
funciones anteriores.

## Panel

- Widget **Equipos AUX**: todos los equipos de un vistazo (apagado, modo y
  consigna, sin conexión, error), con los botones **Apagar todo** y
  **Actualizar**.
- Widget **Equipo AUX**: elija un equipo en los ajustes del widget para ver
  sus temperaturas en directo y controles rápidos (encendido/apagado,
  consigna −0,5 °C / +0,5 °C; calefacción y agua caliente para una bomba de
  calor).

## Solución de problemas

- **«AUX Cloud rechazó el inicio de sesión»**: compruebe la cuenta, la
  contraseña y la región. Inicie sesión en la aplicación AC Freedom con la
  misma cuenta para asegurarse.
- **«AUX Cloud limita las solicitudes»**: aumente el intervalo de
  actualización.
- **Falta un equipo**: debe ser visible en la aplicación AC Freedom con la
  misma cuenta. Los equipos añadidos más tarde se detectan en menos de una
  hora, o al instante con **Probar la conexión** o un nuevo escaneo.
- **Falta una función**: las funciones opcionales solo se publican si el
  equipo las informa.

Consulte los registros de la integración en la interfaz de Gladys para más
detalles. Las contraseñas y los tokens de sesión nunca se escriben en los
registros.
