# TN BJP Design System

A brand and component reference for Tamil Nadu BJP digital properties.

## Color Palette

### Primary — Saffron
| Token | Value |
|---|---|
| Hex | `#F47216` |
| RGB | `244, 114, 22` |
| CMYK | `0, 53, 91, 4` |
| Pantone | 1585 C |
| RAL | 2008 |

### Secondary — Green
| Token | Value |
|---|---|
| Hex | `#00A650` |
| RGB | `0, 166, 80` |
| CMYK | `100, 0, 52, 35` |
| Pantone | 7482 C |
| RAL | 6024 |

### Neutrals
| Token | Value |
|---|---|
| White Hex | `#FFFFFF` |
| White RGB | `255, 255, 255` |
| White CMYK | `0, 0, 0, 0` |
| Black Hex | `#000000` |
| Black RGB | `0, 0, 0` |
| Black CMYK | `0, 0, 0, 100` |
| Black Pantone | Black 6 C |
| Black RAL | 9005 |

### Derived Tints & Shades (for hover/disabled/backgrounds)
| Name | Hex |
|---|---|
| Saffron 100 | `#FEEEE0` |
| Saffron 300 | `#FBB988` |
| Saffron 500 | `#F47216` (base) |
| Saffron 700 | `#C25710` |
| Saffron 900 | `#7A3708` |
| Green 100 | `#DFF5E9` |
| Green 300 | `#7FD3A8` |
| Green 500 | `#00A650` (base) |
| Green 700 | `#00793B` |
| Green 900 | `#004D25` |
| Gray 100 | `#F5F5F5` |
| Gray 300 | `#D4D4D4` |
| Gray 500 | `#8C8C8C` |
| Gray 700 | `#4A4A4A` |
| Gray 900 | `#1A1A1A` |

### Semantic Colors
| Purpose | Hex |
|---|---|
| Success | `#00A650` (Green 500) |
| Warning | `#F47216` (Saffron 500) |
| Error | `#D62828` |
| Info | `#1B6FA8` |

---

## Border Radius Scale

| Token | Value | Usage |
|---|---|---|
| `--radius-none` | `0px` | Flags, official emblems, tables |
| `--radius-xs` | `4px` | Tags, chips, badges |
| `--radius-sm` | `8px` | Buttons (default), input fields |
| `--radius-md` | `12px` | Cards, list items |
| `--radius-lg` | `16px` | Modals, panels, feature cards |
| `--radius-xl` | `24px` | Hero banners, large media blocks |
| `--radius-full` | `9999px` | Pills, avatars, icon buttons |

---

## Layout System

### Grid
- Base unit: `8px`
- Container max-width: `1280px`
- Columns: 12-column grid, `24px` gutter (desktop), `16px` gutter (mobile)
- Breakpoints:
  | Name | Width |
  |---|---|
  | Mobile | `< 640px` |
  | Tablet | `640–1024px` |
  | Desktop | `1024–1440px` |
  | Wide | `> 1440px` |

### Spacing Scale
| Token | Value |
|---|---|
| `space-1` | `4px` |
| `space-2` | `8px` |
| `space-3` | `12px` |
| `space-4` | `16px` |
| `space-5` | `24px` |
| `space-6` | `32px` |
| `space-7` | `48px` |
| `space-8` | `64px` |
| `space-9` | `96px` |

### Page Structure
```
┌─────────────────────────────┐
│  Header (sticky, 72px)      │
├─────────────────────────────┤
│  Hero / Banner               │
├─────────────────────────────┤
│  Content (max 1280px,        │
│  centered, 24px padding)     │
├─────────────────────────────┤
│  Footer                      │
└─────────────────────────────┘
```

---

## Typography

| Style | Font Size | Weight | Line Height | Usage |
|---|---|---|---|---|
| Display | `48px` | 700 | `1.1` | Hero headlines |
| H1 | `36px` | 700 | `1.2` | Page titles |
| H2 | `28px` | 700 | `1.25` | Section headers |
| H3 | `22px` | 600 | `1.3` | Subsection headers |
| H4 | `18px` | 600 | `1.4` | Card titles |
| Body Large | `18px` | 400 | `1.6` | Lead paragraphs |
| Body | `16px` | 400 | `1.6` | Default text |
| Small | `14px` | 400 | `1.5` | Captions, metadata |
| Micro | `12px` | 500 | `1.4` | Tags, labels |

**Font stack:**
- Latin: `'Inter', 'Noto Sans', sans-serif`
- Tamil: `'Noto Sans Tamil', 'Latha', sans-serif`
- Headings (optional flair): `'Poppins', sans-serif` (weight 700)

---

## Shadows & Elevation

| Token | Value |
|---|---|
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.06)` |
| `shadow-md` | `0 4px 8px rgba(0,0,0,0.08)` |
| `shadow-lg` | `0 8px 24px rgba(0,0,0,0.12)` |
| `shadow-xl` | `0 16px 40px rgba(0,0,0,0.16)` |
| `shadow-saffron` | `0 4px 16px rgba(244,114,22,0.25)` (for CTAs) |

---

## Components

### Buttons

**Primary**
- Background: `#F47216`
- Text: `#FFFFFF`
- Padding: `12px 24px`
- Border-radius: `8px` (`--radius-sm`)
- Font: `16px / 600`
- Hover: `#C25710`
- Active: `#7A3708`
- Disabled: `#FBB988`, text `#FFFFFF` at 70% opacity

**Secondary**
- Background: `#00A650`
- Text: `#FFFFFF`
- Same padding/radius as primary
- Hover: `#00793B`

**Outline**
- Background: transparent
- Border: `2px solid #F47216`
- Text: `#F47216`
- Hover: background `#FEEEE0`

**Ghost**
- Background: transparent
- Text: `#1A1A1A`
- Hover: background `#F5F5F5`

**Sizes**
| Size | Padding | Font |
|---|---|---|
| Small | `8px 16px` | `14px` |
| Medium | `12px 24px` | `16px` |
| Large | `16px 32px` | `18px` |

---

### Cards
- Background: `#FFFFFF`
- Border: `1px solid #D4D4D4`
- Border-radius: `12px` (`--radius-md`)
- Padding: `24px`
- Shadow: `shadow-md`
- Hover (interactive cards): `shadow-lg`, transform `translateY(-2px)`

**News/Event Card**
```
┌───────────────────────┐
│ [Image, radius 12px    │
│  top corners only]     │
├───────────────────────┤
│ Tag (pill, saffron)    │
│ H4 Title               │
│ Body small — excerpt   │
│ Date • Small gray      │
└───────────────────────┘
```

---

### Tags / Chips / Badges
- Border-radius: `9999px` (`--radius-full`)
- Padding: `4px 12px`
- Font: `12px / 500`
- Variants:
  - Saffron: bg `#FEEEE0`, text `#C25710`
  - Green: bg `#DFF5E9`, text `#00793B`
  - Neutral: bg `#F5F5F5`, text `#4A4A4A`

---

### Input Fields
- Border: `1px solid #D4D4D4`
- Border-radius: `8px`
- Padding: `12px 16px`
- Font: `16px / 400`
- Focus: border `#F47216`, outline `2px solid #FEEEE0`
- Error: border `#D62828`
- Label: `14px / 600`, `#1A1A1A`, margin-bottom `4px`

---

### Navigation Header
- Height: `72px`
- Background: `#FFFFFF`
- Border-bottom: `1px solid #D4D4D4`
- Logo left, nav links center/right, CTA button far right
- Nav link (active state): text `#F47216`, `2px` bottom border `#F47216`
- Mobile: hamburger menu, radius `4px` on menu icon tap target

---

### Footer
- Background: `#1A1A1A`
- Text: `#FFFFFF` / `#D4D4D4` (secondary text)
- 4-column layout (About, Quick Links, Contact, Social)
- Social icons: `40px` circle, `radius-full`, bg `#4A4A4A`, hover bg `#F47216`
- Bottom bar: copyright, `1px solid #4A4A4A` top border, padding `24px`

---

### Hero / Banner
- Border-radius: `0px` (edge-to-edge) or `24px` if contained
- Gradient overlay option: `linear-gradient(135deg, #F47216 0%, #00A650 100%)` at 85% opacity over image
- Height: `480px` (desktop), `320px` (mobile)
- Overlay text: white, with `text-shadow: 0 2px 8px rgba(0,0,0,0.3)`

---

### Modals
- Border-radius: `16px`
- Max-width: `560px`
- Padding: `32px`
- Shadow: `shadow-xl`
- Backdrop: `rgba(0,0,0,0.5)`
- Close button: top-right, `32px` circle, `radius-full`

---

### Tables
- Border-radius: `0px` (or `12px` with `overflow: hidden` wrapper)
- Header row: bg `#F5F5F5`, text `#1A1A1A`, `14px / 600`
- Row border: `1px solid #D4D4D4`
- Row hover: bg `#FEEEE0`
- Zebra striping (optional): even rows `#FAFAFA`

---

### Alerts / Banners
| Type | Background | Border | Text |
|---|---|---|---|
| Success | `#DFF5E9` | `#00A650` | `#004D25` |
| Warning | `#FEEEE0` | `#F47216` | `#7A3708` |
| Error | `#FBEAEA` | `#D62828` | `#7A1414` |
| Info | `#E6F1F8` | `#1B6FA8` | `#0D3A54` |

- Border-radius: `8px`
- Left accent border: `4px solid` (border color)
- Padding: `16px`

---

### Avatars / Leader Profile Images
- Border-radius: `9999px` (`--radius-full`)
- Sizes: `32px`, `48px`, `64px`, `96px`, `128px`
- Border: `2px solid #FFFFFF` with `shadow-sm` when overlapping

---

### Icon Buttons
- Size: `40px × 40px`
- Border-radius: `9999px`
- Background: `#F5F5F5`
- Hover: `#FEEEE0`, icon color `#F47216`

---

### Pagination
- Numbers: `36px` circle, `radius-full`
- Active: bg `#F47216`, text `#FFFFFF`
- Inactive: bg transparent, text `#4A4A4A`, hover bg `#F5F5F5`

---

## Iconography
- Style: outline icons, `2px` stroke weight
- Default size: `24px`
- Color: `#4A4A4A` (default), `#F47216` (active/accent)
- Party symbol (lotus) reserved for official emblem placements only — not decorative iconography

---

## Motion
| Token | Value |
|---|---|
| `duration-fast` | `150ms` |
| `duration-base` | `250ms` |
| `duration-slow` | `400ms` |
| `easing-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` |

---

## CSS Variables Reference

```css
:root {
  /* Colors */
  --color-saffron-500: #F47216;
  --color-saffron-700: #C25710;
  --color-saffron-100: #FEEEE0;
  --color-green-500: #00A650;
  --color-green-700: #00793B;
  --color-green-100: #DFF5E9;
  --color-white: #FFFFFF;
  --color-black: #000000;
  --color-gray-100: #F5F5F5;
  --color-gray-300: #D4D4D4;
  --color-gray-500: #8C8C8C;
  --color-gray-700: #4A4A4A;
  --color-gray-900: #1A1A1A;

  /* Radius */
  --radius-none: 0px;
  --radius-xs: 4px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-full: 9999px;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;

  /* Shadow */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.06);
  --shadow-md: 0 4px 8px rgba(0,0,0,0.08);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.12);
  --shadow-xl: 0 16px 40px rgba(0,0,0,0.16);

  /* Motion */
  --duration-fast: 150ms;
  --duration-base: 250ms;
  --easing-standard: cubic-bezier(0.4, 0, 0.2, 1);
}
```
