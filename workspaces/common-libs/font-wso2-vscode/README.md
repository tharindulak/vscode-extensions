# @wso2/font-wso2-vscode

## Getting Started

### Developer Guide

- To install all the dependencies, including this module, run the following command:
  ```bash
  rush install
- Copy the icons you want to add to the font to the src/icons directory.
- Generate the font files by running the following command from the font-wso2-vscode root directory:
  ```bash
  npm run build
- To view the generated icons, use the following command:
  ```bash
  npm run start
- To use the generated font add `@wso2/font-wso2-vscode` as a dependency to your package.

### How use the Font

- If the SVG icon name is `ballerina`, you can use it in your HTML as follows:
  ```html
  <i class="fw-ballerina"></i>

### How add icons to plugins (ballerina/choreo)

- Add the relevent icons to src/icons.
- Modify the plugin-icons/config.json file by adding the relevant icon name to the corresponding extension category (ballerinaExtIcons or choreoExtIcons).
- Run the following command to add the icons to the plugins:
  ```bash
  npm run build
### Codepoints

`src/generate-font/codepoints.json` records the codepoint of every icon that has ever been in the
font. `npm run build` reads it, gives each new SVG the lowest unused codepoint, writes the file back
and prints what it allocated — commit it along with the SVG.

Without it, icons are numbered in glob order, so adding one SVG shifts the codepoint of every icon
sorting after it. VS Code extensions hardcode those codepoints (`contributes.icons` takes a
`fontCharacter`, not a name), so a shift repoints their icons at whatever glyph moved into the old
slot. The icon still renders, so nothing fails — it is just the wrong icon.

Deleting an SVG leaves its entry in the file. That holds the codepoint so no other glyph is given
it, and an extension still pointing there renders an empty box rather than an unrelated icon. The
entry does not appear in the generated `.json`, `.css` or `.ts`.

Two branches that each add an icon will both claim the same codepoint. The file is sorted by
codepoint so the two allocations conflict in git; the one merged second should take the next unused
codepoint. The build fails if the file ever allocates one codepoint twice.

### How to use icons in plugins
- To use icons please use the following [format](https://code.visualstudio.com/api/references/icons-in-labels).
  ````
  $(<IconName>);
  ````

### Limitations with the font generation
- Icons with black and white colors are supported by the font library. If you want to add colors, please override the color style property.
- Icons with `.svg` format are supported here.
- Please try to use simple graphics when adding icons. Please refer to the samples from [codicons](https://microsoft.github.io/vscode-codicons/dist/codicon.html).
