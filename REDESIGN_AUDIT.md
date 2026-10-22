# Magnet Madness — auditoría y dirección de rediseño

## Auditoría previa

La revisión se hizo sobre el juego ejecutable y capturas de escritorio y emulación móvil. La simulación, el guardado y los estados de partida ya eran estables; la principal debilidad era que el aspecto y el feedback no expresaban la fantasía de un imán que gobierna el caos.

### Visuales y legibilidad

- El imán tenía una silueta legible, pero ocupaba poco espacio visual y su rostro apenas cambiaba. Se leía como un icono simpático, no como el protagonista de la acción.
- El campo magnético aparecía como arcos tenues alrededor del jugador, sin conectar visualmente al imán con los objetos afectados. La fuerza se percibía débil aunque la simulación sí aplicara aceleración.
- Las monedas, cristales, baterías y escudos tenían colores distintos, pero compartían el mismo tamaño y halo. Su aparición y recogida no tenían un lenguaje visual propio.
- La bomba destacaba poco contra el fondo; la diana era una bullseye estática que no anunciaba una oportunidad ni celebraba el acierto.
- El fondo usaba una cuadrícula regular, puntos y círculos concéntricos. Aportaba textura, pero poca profundidad o identidad, y competía con algunos objetos.
- El HUD y los menús usaban tipografía, escala y color con jerarquía similar. Salud, energía y puntuación estaban presentes, pero no dirigían la atención al estado que importaba en cada momento.
- Las animaciones eran principalmente una inclinación leve del jugador, una oscilación de moneda y un parpadeo de diana. Faltaban anticipación, aceleración y resolución visual en las acciones.

### Jugabilidad y game feel

- El movimiento y la física eran deterministas, pero el personaje pequeño, la poca inercia visual y la falta de reacción al input reducían la sensación de control.
- La atracción no se veía mientras ocurría. Como los beneficios se generaban uniformemente por toda la arena, muchas recompensas aparecían fuera del radio magnético o del lado opuesto del tablero; los primeros segundos podían transcurrir sin que el jugador entendiera la ventaja de atraer.
- La repulsión aplicaba la fuerza definida, pero normalmente no había un pulso legible durante el sostenimiento. La bomba necesita tiempo para acelerarse y cambiar de rumbo; la señal visual y sonora no acompañaba esa espera.
- La recolección emitía un sonido corto y un puñado de partículas pequeñas. No había suficiente diferencia sensorial entre una moneda, completar un multiplicador, una batería y un golpe de diana.
- La diana daba 50 puntos, pero su impacto era breve y no hacía evidente la jugada que lo había causado. El riesgo de acercar una bomba y el premio no estaban enlazados por feedback.
- La primera bomba normal podía tardar hasta 10 segundos en aparecer y después la tasa inicial era baja. El tiempo seguro ayuda a aprender, pero combinado con recompensas lejanas producía una apertura demasiado pasiva.
- La fórmula de combo era clara en código, pero el multiplicador no tenía un medidor de ventana ni un hito audiovisual consistente. Los objetos de recuperación no ayudaban a mantener el flujo de puntuación.

### UX y retención

- El tutorial indicaba movimiento y repulsión, pero no mostraba una recompensa atraída ni explicaba con claridad por qué alternar polaridades. Su bomba era segura, aunque la instrucción no expresaba el ciclo completo de juego.
- Energía y salud eran visibles; faltaba feedback de bajo nivel que conectara el gasto de energía con un uso táctico eficaz.
- El daño mostraba una luz roja, pero la invulnerabilidad y la pérdida de combo no tenían una respuesta del personaje suficientemente clara.
- La pantalla de resultados ofrece reintento en un toque, aunque el resultado tiene poca celebración y no convierte récord, combo o dianas en una meta inmediata para la siguiente partida.
- No hubo prueba con jugadores antes de esta auditoría, por lo que la comprensión, el ritmo real y la motivación de repetición no se consideran medidos.

## Diagnóstico

El circuito estaba completo en términos de reglas, pero sus momentos positivos no se podían leer ni sentir. Eso rompe el enlace entre acción y recompensa: acercar un objeto no parece una elección, repeler una bomba no parece una jugada y completar un combo no parece una victoria. La distribución uniforme de objetos amplificaba el problema al dejar el magnetismo sin una demostración temprana.

## Dirección de rediseño

**Arcade de laboratorio magnético:** un tablero de ciencia ficción juguetón y compacto, con azules profundos, reflejos fríos, metal cálido para las recompensas y coral inequívoco para el peligro. El imán será una mascota de metal esmaltado con expresiones según su intención. El campo se leerá en las trayectorias, no solo en el aura del personaje; cada recogida, repulsión y diana tendrá anticipación, impacto y una salida breve.

El rediseño mantiene una arena, supervivencia infinita, las mismas seis categorías de interacción, el modelo local de progresión y la integración de Poki. La mejora se concentra en distribución de recompensas, balance medido, arte original, feedback, HUD y reintento.

## Resultado del sprint

La comparación se hizo con capturas de menú y partida en Chromium antes y después de los cambios. El alcance se mantiene en una arena, los mismos objetos y la supervivencia infinita.

| Antes | Después |
| --- | --- |
| El protagonista era una U pequeña sin rostro ni reacción. | Imán esmaltado original con ojos, polos definidos, luz y expresiones de atracción, repulsión, daño y combo. Un sprite de presentación separado evita alterar la hitbox. |
| El campo magnético era un aro tenue; no conectaba la acción con su objetivo. | Hasta seis hilos curvos muestran los objetos cercanos que responden, con flechas que viajan hacia dentro al atraer y hacia fuera al repeler. Las bombas peligrosas atraídas usan coral; las repelidas muestran una estela naranja. |
| Monedas y cristales podían aparecer en cualquier punto, a menudo fuera de pantalla para el magnetismo. | Durante los primeros 8 segundos aparecen a 82–148 unidades, dentro de atracción. Después aparecen a 140–225 unidades, favoreciendo la dirección de movimiento para construir rutas y evitar que quedarse quieto sea la opción dominante. |
| Recogidas, combos y tiros a diana se reducían a texto y unos pocos destellos. | Las recogidas producen anillo y estallido, el puntaje hace pop, cada quinto objeto celebra el multiplicador y la ventana de combo aparece como barra que se consume. Las dianas tienen valor visible, brillo, anillo de impacto y celebración sonora. |
| La barra de energía y los puntos de salud tenían poco contraste y estados poco claros. | La energía es una barra más gruesa, con cambio de color; la salud usa corazones, y un combo próximo a expirar tiene una barra propia. Las dianas superiores ya no quedan detrás del panel superior. |
| Música era una secuencia uniforme de tonos; los premios compartían poco carácter. | Melodía pentatónica local con silencios y acentos graves; tonos más escalonados para premio, combo, golpe, energía, escudo y diana. Todo se sintetiza con Web Audio y no usa recursos remotos. |
| La derrota era legible, pero ofrecía poco impulso emocional. | El resultado destaca un nuevo récord y conserva **TRY AGAIN** como acción principal en un único toque. |

### Ajuste de sensación

Se elevó la aceleración magnética máxima de atracción de **1100 a 1400** y la de repulsión de **1750 a 2400**. La fórmula cuadrática, radios, límites de velocidad, resistencias y economía de energía siguen igual. La física continúa usando el único paso fijo de Arcade a 60 Hz; el aumento actúa gradualmente como aceleración, no como impulso instantáneo. Los valores y el motivo están en [`BALANCE.md`](BALANCE.md).

### Evaluación honesta

La inspección manual en Chromium muestra una diferencia clara en tamaño y personalidad del personaje, lectura del magnetismo, recompensa del primer objeto, potencia audiovisual de la repulsión y visibilidad de las dianas en móvil. Las pruebas confirman que la presentación no cambia la hitbox y que la pantalla se mantiene sin errores. Esto deja una build razonable para **pruebas controladas en Poki**, pero no demuestra por sí solo que la sesión sea adictiva ni que el balance guste a jugadores. No se realizaron sesiones con personas ni una prueba en Poki Inspector; quedan como validaciones externas antes de afirmar calidad de lanzamiento. El registro completo está en [`QA.md`](QA.md).

### Segunda pasada de control y magnetismo

El imán se redujo de 72 a 62 unidades de presentación. Aceleración/frenado pasan a 2100/2600 para iniciar, girar y detenerse con mayor precisión, conservando velocidad máxima 230. Las bombas repelidas conservan impulso durante su ventana válida: arrastre 0,22/s frente al normal 1,2/s, sin impulsos extra.

La revisión de una jugada completa destapó dos fallos reales que las pruebas anteriores no cubrían: las hitboxes usaban dimensiones lógicas en lugar de las texturas Canvas dobles y las dianas no pertenecían al grupo de colisión. Se corrigieron los centros/radios y el registro de dianas. Una prueba nueva usa la repulsión por teclado y la física real para empujar una bomba hasta una diana, comprobar 50 puntos exactos y consumirla una sola vez. Así, la mejora táctica está comprobada además de presentarse visualmente.
