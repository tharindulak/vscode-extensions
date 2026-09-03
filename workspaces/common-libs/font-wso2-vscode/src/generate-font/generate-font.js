/**
 * Copyright (c) 2025 WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

const { generateFonts } = require('@twbs/fantasticon');
const fs = require('fs');
const path = require('path');

// codepoints.json is the allocation ledger for this font: every icon that has ever been in it
// keeps the codepoint it was first given.
//
// Left to itself fantasticon numbers icons sequentially in glob order, so adding one SVG shifts
// the codepoint of every icon that sorts after it. Consumers hardcode those codepoints — VS Code's
// contributes.icons takes a fontCharacter, not a name — so a shift silently repoints their icons at
// whatever glyph moved into the old slot, and the icon still renders, just the wrong one. That is
// how $(ballerina-debug) ended up drawing custom.svg (wso2/product-integrator#2288).
//
// Feeding fantasticon a complete map removes its freedom to renumber: a new icon takes the lowest
// unused codepoint and nothing else moves. Retired icons stay in the ledger as reservations so
// their slot is never handed to a different glyph — a consumer still pointing at one renders an
// empty box, which is obvious, rather than an unrelated icon, which is not.
const ICONS_DIR = path.join(__dirname, '..', 'icons');
const CODEPOINTS_PATH = path.join(__dirname, 'codepoints.json');
const START_CODEPOINT = 0xf101;

const readLedger = () => {
    const ledger = JSON.parse(fs.readFileSync(CODEPOINTS_PATH, 'utf-8'));

    // A merge that unions two branches' allocations can hand the same codepoint to two icons, which
    // otherwise surfaces only as one of them rendering the other's glyph.
    const owners = new Map();
    for (const [name, codepoint] of Object.entries(ledger)) {
        // Checked before the collision check below, which compares raw values: fantasticon turns a
        // codepoint into a character with String.fromCharCode, so '61903' and 61903 are one glyph
        // slot while being two distinct Map keys, and anything above 0xffff is truncated into the
        // range and can land on a slot already taken. Either way the collision goes unreported and
        // one icon silently renders another's glyph. Only hand-edits get here — writeLedger emits
        // integers — which is the same reason the collision check exists.
        if (!Number.isInteger(codepoint) || codepoint < START_CODEPOINT || codepoint > 0xffff) {
            throw new Error(
                `${path.basename(CODEPOINTS_PATH)} gives '${name}' the codepoint ` +
                    `${JSON.stringify(codepoint)}, which is not a whole number between ` +
                    `0x${START_CODEPOINT.toString(16)} and 0xffff.`
            );
        }
        if (owners.has(codepoint)) {
            throw new Error(
                `${path.basename(CODEPOINTS_PATH)} allocates 0x${codepoint.toString(16)} to both ` +
                    `'${owners.get(codepoint)}' and '${name}'. Give the icon added most recently the ` +
                    'lowest unused codepoint instead.'
            );
        }
        owners.set(codepoint, name);
    }
    return ledger;
};

// Written back sorted by codepoint: allocations then append rather than interleave, so two branches
// that both add an icon conflict in git instead of merging into a duplicate allocation.
const writeLedger = (ledger) => {
    const sorted = Object.entries(ledger).sort(([, a], [, b]) => a - b);
    fs.writeFileSync(CODEPOINTS_PATH, JSON.stringify(Object.fromEntries(sorted), null, 2) + '\n', 'utf-8');
};

// fantasticon derives an icon's id from its filename ('JSONTransform copy.svg' -> 'JSONTransform-copy'),
// so ask it for the ids rather than deriving them here. Generating no fonts and no assets makes this
// a glob of the icons directory.
const readIconIds = async () => {
    const { assetsIn } = await generateFonts({ inputDir: ICONS_DIR, fontTypes: [], assetTypes: [] });
    return Object.keys(assetsIn);
};

const allocate = (ledger, iconIds) => {
    const used = new Set(Object.values(ledger));
    const added = [];
    let next = START_CODEPOINT;

    for (const id of iconIds) {
        if (ledger[id] !== undefined) {
            continue;
        }
        while (used.has(next)) {
            next++;
        }
        ledger[id] = next;
        used.add(next);
        added.push(id);
    }
    return added;
};

async function generateIconFont() {
    try {
        const distDir = path.join(__dirname, '..', '..', 'dist');
        if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir, { recursive: true });
        }

        console.log('Generating icon font...');

        const ledger = readLedger();
        const iconIds = await readIconIds();
        const added = allocate(ledger, iconIds);
        if (added.length > 0) {
            writeLedger(ledger);
            console.log(
                `Allocated a codepoint to ${added.length} new icon(s) — commit codepoints.json ` +
                    'along with the SVG:\n' +
                    added.map((id) => `  ${id} -> \\${ledger[id].toString(16)}`).join('\n')
            );
        }

        // Only the icons that exist get passed on, so a reservation for a retired icon holds its
        // codepoint without appearing in the generated .json/.css/.ts as an icon you can use. Every
        // id is covered, which leaves fantasticon nothing to number itself.
        const codepoints = Object.fromEntries(iconIds.map((id) => [id, ledger[id]]));

        const config = {
            inputDir: ICONS_DIR,
            outputDir: distDir,
            fontTypes: ['eot', 'woff2', 'woff'],
            assetTypes: ['css', 'html', 'json', 'ts'],
            name: 'wso2-vscode',
            prefix: 'fw',
            normalize: true,
            codepoints,
            formatOptions: {
                json: {
                    indent: 2
                }
            }
        };

        await generateFonts(config);
        console.log('✅ Icon font generated successfully!');

    } catch (error) {
        console.error('❌ Error generating icon font:', error);
        process.exit(1);
    }
}

generateIconFont();
