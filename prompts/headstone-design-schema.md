# Headstone Design Schema Generator

## Purpose
Generate a structured schema for the two-stage headstone design process: Memorial Structure (shape/style) and Surface Design (decoration/customization).

## Prompt for Soup CLI

```
Generate a comprehensive JSON schema for a headstone memorial design system with two primary stages:

STAGE 1: MEMORIAL STRUCTURE
Define all available memorial types with their properties:
- Categories: Upright Monuments, Family Monuments, Flat Markers, Sculpted Monuments, Ledgers, Memorial Benches, Monubenches, Vases, Custom Shapes
- For each type, include:
  - id: unique identifier
  - name: display name
  - description: brief description
  - dimensions: height, width, depth ranges
  - baseOptions: available base styles
  - price_range: lower to higher cost tier
  - production_time: estimated turnaround (e.g., "3-4 months")
  - materials: available material options (granite, marble, bronze, etc.)

STAGE 2: SURFACE DESIGN
Define customization options applied to the chosen memorial:
- Emblems: religious symbols, professions, hobbies, custom graphics
- Layout: positioning rules (top, center, bottom, full-spread)
- Borders: style options (simple line, decorative, thick, ornamental)
- Typography: font families and sizing guidelines
- Decorative Elements:
  - Carvings: depth options, style categories
  - Inlay: stone or metal inlay options
  - Beveled Edges: bevel depth and style options
  - Photo Integration: photo placement zones, image quality specs
- Text Fields: name, dates, epitaph/inscription areas

OUTPUT FORMAT:
Provide a JSON schema that:
1. Defines the memorial structure options as a selection interface
2. Defines surface customization as composition layers
3. Includes validation rules (e.g., max text length, dimension constraints)
4. Supports design preview metadata
5. Can be imported into a design configurator application
```

## Usage in Claude Code

When using Soup CLI with this prompt:

```bash
soup generate-schema < headstone-design-schema.md
```

This will produce a machine-readable JSON schema you can:
1. Import into your Remember Them designer
2. Use to validate customer designs
3. Generate design recommendation flows
4. Export to manufacturing/fulfillment systems

## Key Design Principles

- **Sequential Decision-Making**: Stage 1 (structure) selection constrains Stage 2 (surface) options
- **Scalable Customization**: Support both simple pre-configured designs and fully custom monuments
- **Production-Aware**: Include constraints that reflect actual fabrication capabilities
- **Pricing Model**: Surface design complexity affects final cost
- **Accessibility**: Ensure font sizes and contrast ratios are legible on stone

## Integration Points

- Intake flow (remember-them/intake.html): Guides through Stage 1
- Designer (remember-them/designer.html): Renders Stage 2 customizations
- Preview (stone.js): Visualizes the combined memorial design
- Checkout: Generates production specifications from schema

