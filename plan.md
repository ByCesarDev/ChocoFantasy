# ChocoFantasy — Plan Maestro y Diseño de Mecánicas

> Visión del Proyecto: Crear una experiencia definitiva de Chocobos en Minecraft Bedrock, combinando nuestro motor de vuelo 3D vectorial, modelos anatómicos detallados y mecánicas orgánicas inspiradas en el lore de Final Fantasy y los mejores aportes de la comunidad, manteniendo identidad propia y balance survival.

---

## 1. Sistema de Linajes y Genética Dinámica
Cada color de Chocobo no es una simple textura, sino una especie con especialidad de terreno, atributos únicos y rol en la aventura:

* **🌿 Chocobo Forestal (`cf:chocobo_green`):**
  * *Especialidad:* **Caminata en copas de árboles**. Detecta hojas (`leaves`) bajo sus patas y se estabiliza suavemente para correr sobre el dosel de la selva sin caerse por los huecos.
  * *Defensa:* Inmune a espinas, arbustos de bayas dulces y cactus.
* **🌊 Chocobo Ribereño / Costero (`cf:chocobo_blue`):**
  * *Especialidad:* **Hidroplaneo**. Al entrar en contacto con el agua, no se hunde; desliza a +40% de velocidad horizontal dejando una estela de espuma en las patas.
  * *Adaptación:* Respiración acuática completa; el jinete no es desmontado en el agua.
* **🌑 Chocobo de Caverna (`cf:chocobo_black`):**
  * *Especialidad:* **Ojos brillantes en la oscuridad**. Mientras el jinete esté montado, recibe visión nocturna natural (`night_vision`).
  * *Defensa:* 50 HP (blindaje de roca) e inmunidad al daño por caída. Amortigua vibraciones sculk en profundidades.
* **🔮 Chocobo Abisal (`cf:chocobo_purple`):**
  * *Especialidad:* Hermano místico de las profundidades y cuevas frondosas. Otorga visión nocturna al jinete, inmunidad a caídas y gran agilidad de salto.
* **❄️ Chocobo Celestial (`cf:chocobo_white`):**
  * *Especialidad:* **Sustentación celestial**. Planeo extendido casi horizontal (-0.02 de descenso) y aura de regeneración de vida para el jinete y el Chocobo en vuelo.
* **☀️ Chocobo Soberano (`cf:chocobo_gold`):**
  * *Especialidad:* **Rey de los cielos y la velocidad**. Velocidad crucero 1.50, sprint aéreo supersónico 3.30, ascenso turbo 1.50 y **100% inmune a fuego y lava** (`fire_immune: true`).
* **🌾 Chocobo Silvestre (`cf:chocobo_yellow_1`):**
  * *Especialidad:* El todoterreno equilibrado, resistente y leal para la exploración temprana del Overworld.

---

## 2. Botánica y Nutrición Chocobo: Convivencia Armónica (Gysahl, Reagan y Fruta de la Vida)

Para respetar el lore de Final Fantasy y los ítems ya existentes en ChocoFantasy, establecemos una jerarquía nutricional clara de 3 niveles:

```
┌─────────────────────────────────────────────────────────────┐
│ NIVEL 1: Gysahl Greens (Silvestre / Agrícola)               │
│ - Crece en la naturaleza, se cultiva en huertos con semillas│
│ - Alimento común diario, atracción de aves y cría básica    │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ NIVEL 2: Semillas / Tónico de Reagan (Artesanal / Avanzado) │
│ - Crafteo: Trigo + Remolacha + Calabaza + Sandía            │
│ - Ítem de domesticación suprema, vigor y aceleración        │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ NIVEL 3: Fruta de la Vida (Mística / Celestial)             │
│ - Ítem raro de sanación milagrosa instantánea               │
│ - Otorga levitación al jugador y cataliza linajes alados    │
└─────────────────────────────────────────────────────────────┘
```

### Usos y Roles de cada Alimento:
1. **Verdura Gysahl (Gysahl Greens):**
   * *Obtención:* Se encuentra silvestre en praderas y llanuras. Se puede cosechar para obtener hojas y semillas de Gysahl, que se plantan en tierra arada con etapas de crecimiento y respuesta a polvo de hueso.
   * *Función:* Es el alimento base. Alimenta a los Chocobos para regenerar poca vida y se utiliza para activar el modo de apareamiento entre dos Chocobos en un nido.
2. **Semillas y Tónico de Reagan (`cf:reagan`):**
   * *Obtención:* Ya presente en ChocoFantasy (crafteo de 4 semillas agrícolas).
   * *Función:* En el lore de Final Fantasy VII, Reagan es la verdura de alto rendimiento. En ChocoFantasy es el **ítem exclusivo para domesticar** (`tame_items: "cf:reagan"`). Además, alimentar a un Chocobo ya domesticado con Reagan le otorga un impulso temporal de velocidad y resistencia al cansancio.
3. **Fruta de la Vida (`cf:fruit_life`):**
   * *Obtención:* Tesoros, mazmorras y cosechas raras de árboles antiguos.
   * *Función:* Curación masiva en combate cuando el Chocobo está gravemente herido. Si la consume el jinete, le otorga levitación mística. Si se le da a una pareja junto con Reagan en un nido celestial, estimula la probabilidad de engendrar linajes Blanco o Dorado.

---

## 3. Crianza por Cuidado y Nido Térmico

En lugar de un temporizador afk genérico:

* **El Bloque "Nido de Paja":**
  * Se craftea con trigo, palos y un bloque de heno.
  * Permite depositar el huevo en su centro con un modelo 3D visible.
* **Incubación Térmica:**
  * Para que el huevo empiece a incubar, el nido debe recibir calor: estar colocado sobre un bloque de heno (`minecraft:hay_block`) o tener cerca una fogata/antorchas en biomas fríos.
* **Vínculo Musical (Imprinting):**
  * Si el jugador toca el silbato de Chocobo cerca del nido durante los últimos segundos de incubación, el polluelo nace con **impronta maternal**: se domestica automáticamente al nacer sin necesidad de gastar Reagan y nace con un corazón adicional de vida.

---

## 4. Equipamiento Modular y Personalización

* **Arnés y Barda de Cuero Teñible en Caldero (RGB Dinámico):**
  * Inspirado en la integración de `minecraft:cauldron` y `minecraft:fluid_container`: hacer clic derecho con la barda de cuero en un caldero con agua teñida guarda el color RGB exacto en propiedades dinámicas del ítem.
  * La montura y las borlas de plumas del Chocobo renderizan ese tono personalizado.
* **Placas Metálicas Ligeras (Cobre, Hierro, Oro, Diamante, Netherite):**
  * Armaduras diseñadas como pecheras y protecciones en garras que brindan armadura real sin comprometer la agilidad de vuelo.
* **Alforjas con Drop Seguro:**
  * Al equipar un cofre al Chocobo, se añade un inventario de carga (16 casillas).
  * Al desequiparlo con tijeras, el script vacía todos los objetos contenidos al suelo de forma segura antes de soltar el cofre, evitando cualquier pérdida de ítems.

---

## 5. Interacción Viva, Silbato y Control

* **Órdenes Rápidas por Sneak + Clic (En el Chocobo):**
  * Con la mano vacía, agacharse e interactuar cicla al instante entre:
    * 🛑 **Sentado (Guardia / Espera fija)**
    * 🐾 **Seguir (Compañero leal a tu lado)**
    * 🌾 **Pasear (Vagabundeo libre en la zona)**
    * Muestra un aviso en el Action Bar traducible y reproduce un graznido característico.
* **Silbato Melódico a Distancia:**
  * *Uso principal (Clic derecho sostenido):* Toca una melodía de notas nostálgicas. Si tu Chocobo domesticado está en un radio de 50 bloques, responderá y vendrá corriendo o volando hacia ti.
  * *Uso secundario (Sneak + Clic):* Abre una interfaz de estado para consultar a tus Chocobos leales.
* **ChocoWiki / Registro de Explorador:**
  * Un libro guía interactivo donde se van registrando los linajes descubiertos, con descripciones de sus hábitats, dietas y estadísticas de vuelo.

---

## 6. Hoja de Ruta de Implementación

- [x] **Fase 1: Linajes y Texturas Base**
  - [x] Creación de las 6 variantes de textura (Verde, Azul, Negro, Púrpura, Blanco, Dorado).
  - [x] Creación de los 6 huevos de aparición (Spawn Eggs) 40x40.
  - [x] Definición de entidades BP, RP y Spawn Rules por bioma.
  - [x] Integración de habilidades de linaje en Script API (`main.js`).
- [ ] **Fase 2: Calidad de Vida e Interacción**
  - [x] Implementar ciclo de órdenes por Sneak + Clic con Action Bar (`sit`, `follow`, `wander`).
  - [ ] Alforjas/Cofre equipable con almacenamiento y desequipado seguro con tijeras.
- [ ] **Fase 3: Botánica y Ecosistema Nutricional**
  - [ ] Implementar el bloque de cultivo de Gysahl Greens con sus semillas y etapas.
  - [ ] Integrar el trío nutricional: Gysahl (comida base/cría) + Reagan (domesticación/velocidad) + Fruta de la Vida (cura/levitación).
- [ ] **Fase 4: Crianza Térmica y Nidos**
  - [ ] Bloque 3D de Nido de Paja.
  - [ ] Lógica de incubación con calor y nacimiento con impronta.
- [ ] **Fase 5: Equipamiento y Caldero**
  - [ ] Teñido de barda de cuero en caldero con Script API.
  - [ ] Placas metálicas de protección.
- [x] **Fase 6: Silbato Melódico y Guía**
  - [x] Silbato con arpegio sonoro y llamada a distancia.
  - [x] Registro/Guía de Chocobos (ChocoWiki / Chocopedia).
