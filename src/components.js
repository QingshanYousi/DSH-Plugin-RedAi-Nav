/**
 * Site-side UI: the card, the banner, the site detail page and the shared
 * motion primitives (star toggle, counter).
 *
 * Fragment rules (see scripts/build.mjs): no `import`/`export`; `jsx`, `jsxs`
 * and `React` come from the enclosing factory scope. CSS for this half lives in
 * `cssSites`; page.js concatenates it with `cssPlugins` and injects it once.
 * CSS rules are packed two per line to keep the fragment reviewable.
 */

const cssSites = [
  // Local motion variables live on the page root so `:root` stays untouched.
  '.redaiNavPage{flex:1 1 auto;min-width:0;height:100%;overflow:auto;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);color-scheme:light;--redai-fast:120ms;--redai-state:240ms;--redai-slow:380ms;--redai-ease:cubic-bezier(.16,1,.3,1)}.redaiNavHead{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:14px 24px;background:var(--dsw-alias-bg-base);border-bottom:.5px solid var(--dsw-alias-border-l1)}',
  // `light-dark()` resolves against the used color-scheme, and the host never
  // declares one: it only flips `body[data-ds-dark-theme]` (the dark tokens live
  // there, 38 rules, no `color-scheme` anywhere in that block, and no JS writing
  // it). So the page pins its own scheme from the host's switch. Not `light
  // dark`, which follows the OS preference and would be wrong whenever the host
  // forces a theme. If the host ever renames the attribute the failure mode is
  // "dark theme paints the light half" — visible, not broken. `color-scheme`
  // inherits, and every view is a `.redaiNavPage`, so one pair covers all of it.
  // This is the one host contract the package manifest cannot declare, so it is
  // also written down in README §兼容性 →「依赖的宿主约定」.
  'body[data-ds-dark-theme] .redaiNavPage{color-scheme:dark}',
  // The search box is wrapped so the clear control can float inside its right
  // edge without joining the header's width budget.
  '.redaiNavSearchWrap{position:relative;flex:1;min-width:0;display:flex;align-items:center}.redaiNavSearch{width:100%;min-width:0;height:32px;padding:0 10px;font:inherit;font-size:13px;border-radius:var(--dsw-radius-sm,8px);border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit}.redaiNavSearch::placeholder{color:var(--dsw-alias-label-tertiary)}',
  // The clear control is absolute, so mounting it cannot shift the caret line;
  // only the text padding changes, and the input box itself never moves.
  '.redaiNavSearchWrap.hasQuery .redaiNavSearch{padding-right:26px}.redaiNavSearchClear{position:absolute;right:6px;top:50%;transform:translateY(-50%);display:grid;place-items:center;width:18px;height:18px;padding:0;font:inherit;font-size:13px;line-height:1;color:var(--dsw-alias-label-tertiary);background:transparent;border:0;border-radius:4px;cursor:pointer}',
  // 18px glyph, 28px hit area: the ::after reaches into the input's own padding,
  // where no other control competes for the pointer.
  '.redaiNavSearchClear::after{content:"";position:absolute;inset:-5px;border-radius:7px}.redaiNavSearchClear:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  '.redaiNavSearchClear:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
    // The counter sits in a fixed-height window so the roll-in cannot change the header height.
  '.redaiNavSearch:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}.redaiCountBox{flex:none;display:inline-block;height:18px;overflow:hidden;vertical-align:top}',
  '.redaiNavCount{display:block;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;animation:redaiOdo var(--redai-fast) var(--redai-ease) both}.redaiNavActions{position:relative;display:flex;flex:none;align-items:center;gap:4px}',
  '.redaiNavBtn{display:grid;place-items:center;width:28px;height:28px;padding:0;font:inherit;font-size:15px;line-height:1;color:var(--dsw-alias-label-secondary);background:transparent;border:.5px solid transparent;border-radius:var(--dsw-radius-sm,8px);cursor:pointer}.redaiNavBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  '.redaiNavBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.redaiNavMenu{position:absolute;top:34px;right:0;z-index:6;display:flex;flex-direction:column;min-width:190px;padding:5px;border:0;border-radius:var(--dsw-radius-md,10px);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-panel,0 8px 24px rgba(0,0,0,.14));animation:redaiPopIn var(--redai-fast) var(--redai-ease) both}',
  '.redaiNavMenuItem{display:block;width:100%;padding:7px 10px;font:inherit;font-size:13px;line-height:18px;text-align:left;color:inherit;background:transparent;border:0;border-radius:6px;cursor:pointer}.redaiNavMenuItem:hover{background:var(--dsw-alias-interactive-bg-hover)}',
    // Second-click confirmation: tinted while armed, and it self-disarms on a timer.
  '.redaiNavMenuItem.danger{color:var(--dsw-alias-state-warn-label,#d33)}.redaiNavMenuItem.danger[data-armed="true"]{background:color-mix(in srgb, var(--dsw-alias-state-warn-label,#d33) 10%, transparent);box-shadow:inset 0 0 0 .5px color-mix(in srgb, var(--dsw-alias-state-warn-label,#d33) 45%, transparent)}',
  '.redaiNavMenuHint{padding:5px 10px 3px;margin-top:3px;font-size:11px;line-height:15px;color:var(--dsw-alias-label-tertiary);border-top:.5px solid var(--dsw-alias-border-l1)}.redaiNavAdd{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 24px;background:var(--dsw-alias-bg-layer-1);border-bottom:.5px solid var(--dsw-alias-border-l1)}',
  '.redaiNavInput{height:28px;padding:0 8px;font:inherit;font-size:13px;color:inherit;background:var(--dsw-alias-bg-base);border:.5px solid var(--dsw-alias-border-l1);border-radius:6px}.redaiNavInput:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}',
  '.redaiNavInput.name{flex:0 0 132px}.redaiNavInput.url{flex:1 1 240px;min-width:0}',
  '.redaiNavAddNote{flex:1 1 100%;font-size:11px;line-height:16px;color:var(--dsw-alias-state-warn-label,#d33)}.redaiNavRecent{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 24px;border-bottom:.5px solid var(--dsw-alias-border-l1)}',
  '.redaiNavRecentLabel{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}.redaiNavChip{position:relative;height:22px;padding:0 9px;font:inherit;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary);background:transparent;border:.5px solid var(--dsw-alias-border-l1);border-radius:999px;cursor:pointer}',
  // Vertical only, and anchored by an explicit height instead of an inset: a
  // 22px chip needs 28px of pointer target, and the chips already sit 6px apart,
  // so growing sideways would let two neighbours fight over the same pixel.
  // `inset` would be measured against the padding box, which the half-pixel
  // border shrinks unpredictably — `height` cannot drift.
  '.redaiNavChip::after{content:"";position:absolute;left:0;right:0;top:50%;height:28px;transform:translateY(-50%);border-radius:999px}',
  '.redaiNavChip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.redaiNavBody{padding:4px 24px 40px}',
  '.redaiNavGroup{padding-top:18px}.redaiNavGroupTitle{display:flex;align-items:baseline;gap:8px;margin:0 0 10px;font-size:13px;line-height:20px;font-weight:600}',
  '.redaiNavGroupCount{font-size:11px;line-height:16px;font-weight:400;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}.redaiNavGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}',
  '.redaiNavCard{position:relative;display:flex;align-items:center;gap:10px;min-width:0;padding:9px 9px 9px 11px;border-radius:var(--dsw-radius-md,10px);color:inherit;text-decoration:none;transition:background var(--redai-fast) ease}.redaiNavCard:hover{background:var(--dsw-alias-interactive-bg-hover)}',
    // Hover is a quiet tint; keyboard selection adds a brand tint so both states can coexist.
  '.redaiNavCard:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.redaiNavCardActive{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent)}',
  '.redaiNavCardActive::before{content:"";position:absolute;left:0;top:7px;bottom:7px;width:2px;border-radius:2px;background:var(--dsw-alias-brand-primary);animation:redaiRail var(--redai-fast) var(--redai-ease) both}.redaiNavTile{position:relative;flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:8px;font-size:12px;font-weight:600;color:#fff}',
  '.redaiNavMeta{min-width:0;flex:1}.redaiNavTitleRow{display:flex;align-items:center;gap:5px;min-width:0;margin-right:auto}',
  '.redaiNavTitle{flex:0 1 auto;min-width:0;font-size:13px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.redaiTagPill{flex:none;padding:0 4px;font-size:11px;line-height:16px;font-weight:600;letter-spacing:.01em;border-radius:4px}',
  // Badge palette (A1). Both status pills are "coloured text + the same colour
  // at 18% alpha", so each text colour is the *darkest* tint of its own hue that
  // still clears the bar — measured text vs the composited wash, in four states
  // (light/dark x rest/hover) and against both surfaces a badge can sit on.
  // Target is 4.9, not 4.5: the wash rides on the host's hover veil
  // (`--dsw-alias-interactive-bg-hover`, #2631480f / #ffffff14 — read out of the
  // host bundle), and that token may drift. `hot` 5.89 / 5.33 / 6.67 / 5.36,
  // `new` 6.38 / 5.79 / 6.70 / 5.38 (measured against real pixels, worst cell of
  // the archived card included). Raising the alpha alone is a trap — the
  // wash moves toward the text and drags the ratio down, which is why the text
  // had to be deepened as well.
  '.redaiTagPill.hot{color:light-dark(#9b1c20,#ffbfc2);background:color-mix(in srgb,currentColor 18%,transparent)}.redaiTagPill.new{color:light-dark(#125736,#8de0b8);background:color-mix(in srgb,currentColor 18%,transparent)}',
  // Description and host share one line box and cross-fade, so nothing shifts on hover.
  '.redaiNavMetaLine{position:relative;height:16px;overflow:hidden}.redaiNavDesc{position:absolute;inset:0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:opacity var(--redai-fast) ease,transform var(--redai-fast) ease}',
  '.redaiNavHost{position:absolute;inset:0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;transform:translateY(2px);transition:opacity var(--redai-fast) ease,transform var(--redai-fast) ease}.redaiNavMetaLine.solo .redaiNavHost{opacity:1;transform:none}',
  '.redaiNavCard:hover .redaiNavDesc,.redaiNavCardActive .redaiNavDesc{opacity:0;transform:translateY(-2px)}.redaiNavCard:hover .redaiNavHost,.redaiNavCardActive .redaiNavHost{opacity:1;transform:none}',
  // Without hover there is no way to reveal the host, so the description stays put.
  // No hover means no way to reveal the host, so the description stays put.
  '@media (hover:none){.redaiNavHost{display:none}.redaiNavMetaLine.solo .redaiNavHost{display:block;opacity:1}}.redaiNavStar{position:relative;flex:none;display:grid;place-items:center;width:22px;height:22px;padding:0;font-size:13px;line-height:1;color:var(--dsw-alias-label-secondary);background:transparent;border:0;border-radius:5px;cursor:pointer;opacity:.85}',
  '.redaiNavCard:hover .redaiNavStar{opacity:1}.redaiNavStar:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  // 22px glyph, 28px hit area. -3px is deliberately the largest inset that stops
  // short of the 10px gap to ⓘ and ×: both neighbours grow 4px, leaving 3px of
  // dead space, so a click between two controls can never land on the wrong one.
  // Keyboard and screen-reader paths are untouched — only the pointer box grows.
  '.redaiNavStar::after{content:"";position:absolute;inset:-3px;border-radius:7px}',
  '.redaiNavGlyph{display:block;transition:transform var(--redai-fast) var(--redai-ease)}.redaiNavStar:active .redaiNavGlyph{transform:scale(.9)}',
  // The amber pair clears 3.5:1 on both surfaces the star appears on (bg-base
  // 3.82, bg-layer-1 3.54), which is the 3:1 floor for a non-text glyph; the
  // earlier amber sat at 2.45 and failed 1.4.11.
  '.redaiNavStar.on{color:light-dark(#aa7a00,#f0b429);opacity:1}.redaiNavStar.on .redaiNavGlyph{animation:redaiStarPop var(--redai-state) var(--redai-ease)}',
  '.redaiDust{position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none}.redaiDust i{position:absolute;display:block;width:3px;height:3px;margin:-1.5px 0 0 -1.5px;border-radius:50%;background:currentColor;animation:redaiDust var(--redai-slow) var(--redai-ease) forwards}',
  // ⓘ is the only way into a detail page: hidden until the card is hovered,
  // focused or keyboard-selected, with ::after growing the hit area to 30px.
  '.redaiNavInfo{position:relative;flex:none;display:grid;place-items:center;width:22px;height:22px;padding:0;font-size:12px;line-height:1;color:var(--dsw-alias-label-secondary);background:transparent;border:0;border-radius:5px;cursor:pointer;opacity:0;transition:opacity var(--redai-fast) ease}.redaiNavInfo::after{content:"";position:absolute;inset:-4px;border-radius:8px}',
  '.redaiNavCard:hover .redaiNavInfo,.redaiNavInfo:focus-visible,.redaiNavCardActive .redaiNavInfo{opacity:1}.redaiNavInfo:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  '.redaiNavInfo:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.redaiNavDel{position:relative;flex:none;display:grid;place-items:center;width:20px;height:20px;padding:0;font-size:13px;line-height:1;color:var(--dsw-alias-label-tertiary);background:transparent;border:0;border-radius:4px;cursor:pointer;opacity:0}',
  // 20px glyph, 28px hit area, and it still stops 3px short of the star's box.
  '.redaiNavDel::after{content:"";position:absolute;inset:-4px;border-radius:7px}',
  // Touch devices have no hover, so ⓘ must be visible up front — it is the only
  // door to a detail page. Kept after the base rule and one class heavier so a
  // later reorder of the sheet cannot silently hide it again.
  '@media (hover:none){.redaiNavCard .redaiNavInfo{opacity:1}}',
  '.redaiNavCard:hover .redaiNavDel,.redaiNavDel:focus-visible{opacity:1}.redaiNavDel:hover{color:var(--dsw-alias-state-warn-label,#d33)}',
  '.redaiNavEmpty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:320px;padding:48px 0;text-align:center}.redaiNavEmptyTitle{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}',
  '.redaiNavEmptyHint{max-width:420px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}.redaiNavEmptyActions{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}',
    // Toast floats over the list instead of pushing it: sticky bottom, last child.
  '.redaiNavFoot{padding:24px 24px 32px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}.redaiToast{position:sticky;bottom:16px;z-index:5;display:flex;align-items:center;gap:8px;margin:0 auto 16px;width:max-content;max-width:calc(100% - 48px);padding:6px 8px 6px 12px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,10px);box-shadow:var(--dsw-elevation-panel,0 8px 24px rgba(0,0,0,.14));animation:redaiToastIn 180ms var(--redai-ease) both}',
  '.redaiToastText{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.redaiToastAction{position:relative;flex:none;height:22px;padding:0 8px;font:inherit;font-size:12px;line-height:20px;color:var(--dsw-alias-brand-primary);background:transparent;border:.5px solid var(--dsw-alias-border-l1);border-radius:6px;cursor:pointer}',
  // Undo is 22px tall in a flex row: grow the pointer box up and down only, so
  // the toast never changes height and the button never leaves the flow. Height
  // is anchored to the centre instead of stretching `top`/`bottom`, because an
  // absolutely positioned box is laid out against the padding box — a 0.5px
  // border would quietly eat 1px and land at 27. Width already clears 28px, and
  // staying off the horizontal axis keeps it out of the 8px gap it shares with
  // the ×.
  '.redaiToastAction::after{content:"";position:absolute;top:50%;left:0;right:0;height:28px;transform:translateY(-50%);border-radius:8px}',
  '.redaiToastAction:hover{background:var(--dsw-alias-interactive-bg-hover)}.redaiToastClose{position:relative;flex:none;display:grid;place-items:center;width:20px;height:20px;padding:0;font-size:13px;line-height:1;color:var(--dsw-alias-label-tertiary);background:transparent;border:0;border-radius:4px;cursor:pointer}',
  // 20px glyph, 28px target, both axes anchored to the centre so no border or
  // padding rounding can shrink it. The box claims 4px of the 8px gap to Undo,
  // which needs the other 4px — they touch without overlapping.
  '.redaiToastClose::after{content:"";position:absolute;top:50%;left:50%;width:28px;height:28px;transform:translate(-50%,-50%);border-radius:8px}',
  '.redaiToastClose:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.redaiBanner{position:relative;display:flex;align-items:center;gap:16px;margin:14px 24px 0;padding:14px 40px 14px 16px;border-radius:var(--dsw-radius-lg,14px);background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1)}',
  '.redaiBannerText{flex:1;min-width:0}.redaiBannerKicker{font-size:10px;line-height:14px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--dsw-alias-brand-primary)}',
  '.redaiBannerTitle{margin-top:3px;font-size:15px;line-height:22px;font-weight:600}.redaiBannerDesc{margin-top:3px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
  '.redaiBannerCta{position:relative;height:26px;margin-top:9px;padding:0 10px;font:inherit;font-size:12px;line-height:24px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.18));border-radius:6px;cursor:pointer}.redaiBannerCta:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  // 26px -> 28px: one pixel above and below, no horizontal growth (the label is
  // already wider than 28px). Centre-anchored for the same padding-box reason as
  // the toast controls above.
  '.redaiBannerCta::after{content:"";position:absolute;top:50%;left:0;right:0;height:28px;transform:translateY(-50%);border-radius:7px}',
  '.redaiBannerArt{flex:none;width:132px;height:80px}.redaiBannerClose{position:absolute;top:6px;right:6px;display:grid;place-items:center;width:20px;height:20px;padding:0;font-size:13px;line-height:1;color:var(--dsw-alias-label-tertiary);background:transparent;border:0;border-radius:4px;cursor:pointer}',
  // 20px glyph, 28px target, centre-anchored on both axes. The banner's 40px
  // right padding and 6px inset leave the expanded box 3px inside the frame, so
  // nothing is clipped and the copy keeps 158px of clearance.
  '.redaiBannerClose::after{content:"";position:absolute;top:50%;left:50%;width:28px;height:28px;transform:translate(-50%,-50%);border-radius:8px}',
    // sticky back control lands on the same axis in both views.
    // Detail pages reuse the list's scroll container and padding rhythm, so the
  '.redaiBannerClose:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.redaiDetailShell{padding:0 24px 40px;max-width:760px}',
  // Site details carry a sticky rail (contents + the rest of the group), so they
  // get a wider shell and become a query container. Keyed off the rail itself
  // rather than a flag, so any renderer that emits the document gets the same
  // layout — and every site emits it, editorial content or not.
  '.redaiDetailShell:has(.redaiDocRail){max-width:980px;container-type:inline-size}',
  '.redaiDetail{flex:1 1 auto;min-width:0;padding-top:8px}.redaiDetail>.redaiGhost{position:sticky;top:0;z-index:2;background:var(--dsw-alias-bg-base);margin-left:-2px}',
  // The header is capped so the star stays with the title instead of floating at
  // the far edge of a 980px shell. 520 is measured, not guessed: the row starts
  // at the shell's 24px padding (x=221 in a 1180 shell), so a 720px cap would
  // still park the star at x≈944 — 650px from the title it belongs to. At 520
  // the star lands at x≈744, next to the content it acts on. The narrow
  // container drops the cap entirely rather than clipping it.
  '.redaiDetailTop{display:flex;align-items:flex-start;gap:14px;max-width:520px}.redaiDetailIcon{flex:none;display:grid;place-items:center;width:46px;height:46px;border-radius:12px;font-size:20px;font-weight:600;color:#fff}',
  '.redaiDetailHead{flex:1;min-width:0}.redaiDetailTitle{font-size:18px;line-height:26px;font-weight:600}',
  '.redaiDetailTagline{margin-top:4px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}.redaiDetailTags{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}',
  '.redaiTag{padding:3px 8px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:999px}.redaiDetailBar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:18px}',
  '.redaiPrimary{height:30px;padding:0 14px;font:inherit;font-size:13px;line-height:28px;color:var(--dsw-alias-label-primary-inverted,#fff);background:var(--dsw-alias-button-primary-fill,#4d6bfe);border:0;border-radius:7px;cursor:pointer}.redaiPrimary:hover{background:var(--dsw-alias-button-primary-hover,#3f5bea)}',
  '.redaiGhost{height:30px;padding:0 11px;font:inherit;font-size:12px;line-height:28px;color:var(--dsw-alias-label-secondary);background:transparent;border:.5px solid var(--dsw-alias-border-l1);border-radius:7px;cursor:pointer}.redaiGhost:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  '.redaiSection{margin-top:18px}.redaiSectionTitle{margin:0 0 8px;font-size:13px;line-height:20px;font-weight:600}',
  '.redaiP{margin:0 0 9px;font-size:13px;line-height:22px;color:var(--dsw-alias-label-secondary)}.redaiScenario{display:flex;gap:9px;padding:7px 0}',
  '.redaiScenarioIcon{flex:none;width:20px;font-size:14px;line-height:20px}.redaiScenarioTitle{font-size:13px;line-height:20px;font-weight:500}',
  '.redaiScenarioDesc{margin-top:1px;font-size:12px;line-height:19px;color:var(--dsw-alias-label-tertiary)}.redaiStep{position:relative;margin:0 0 6px;padding-left:22px;font-size:13px;line-height:21px;color:var(--dsw-alias-label-secondary)}',
  '.redaiStepNum{position:absolute;left:0;top:1px;display:grid;place-items:center;width:16px;height:16px;font-size:10px;line-height:1;color:var(--dsw-alias-label-tertiary);border:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.18));border-radius:50%;font-variant-numeric:tabular-nums}.redaiLinks{display:flex;flex-wrap:wrap;gap:8px}',
  // ── Site detail as a reading document ──────────────────────────────────────
  // The page answers one question — "can this solve my problem?" — so the body
  // is a single column of sections in judgement order, with a sticky contents
  // list that only appears when the panel is wide enough to afford it.
  '.redaiDocHost{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
  '.redaiDoc{display:grid;grid-template-columns:minmax(0,1fr);gap:0;margin-top:10px}',
  // The rail is a wide-panel affordance: below 720px it would eat the width the
  // prose needs. It is not moved into the flow, it is dropped — the same sibling
  // list is emitted once more as the last body section, so nothing is lost.
  '.redaiDocRail{display:none}',
  // The rail holds two separate answers — "where am I in this page" and "where
  // else could I go" — so when both are present a hairline keeps them apart.
  '.redaiDocToc+.redaiRailNav{margin-top:18px;padding-top:14px;border-top:.5px solid var(--dsw-alias-border-l1)}',
  '.redaiRailNav{margin-bottom:18px}',
  // Small print in the rail and the record grid (10–11px). The host's tertiary is
  // #81858c, which is 3.71:1 on white — under the 4.5 line for text this size, and
  // it was too light to read in the rail's 164px column. The light half is
  // deepened to #61666b (5.80:1); the dark half keeps the host's tertiary
  // (8.54:1), so neither theme invents a colour. Same pairing as the board's six
  // grey labels — see docs/review/tools/rank-text-contrast.mjs for the method and
  // detail-contrast.mjs for these seven selectors.
  // "You are here" in the group. The current site is never one of the links
  // below it, so this line is what carries `aria-current="page"`.
  '.redaiRailHere{padding:3px 0 3px 9px;font-size:10px;line-height:15px;color:light-dark(#61666b,var(--dsw-alias-label-tertiary));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.redaiSiblingList{display:flex;flex-direction:column;gap:2px;margin:0;padding:0;list-style:none}',
  // The body copy is the fuller shape: two columns of cards, each carrying the
  // list's own description under the name. Two is the width where a description
  // still reads as a sentence instead of a column of two words.
  '.redaiSiblingGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0;padding:0;list-style:none}',
  '.redaiSiblingGrid .redaiSibling{padding:9px 11px;border:.5px solid var(--dsw-alias-border-l1);border-radius:8px}',
  '.redaiSiblingDesc{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;margin-top:2px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}',
  '.redaiSiblingGrid .redaiSiblingName{font-size:13px;line-height:19px;color:var(--dsw-alias-label-primary)}',
  // One row per site in both placements: name over host, both ellipsised, so a
  // long site name can never push the rail or the grid wider than its box.
  '.redaiSibling{display:flex;flex-direction:column;min-width:0;padding:5px 8px;border-radius:6px;color:inherit;text-decoration:none}',
  '.redaiSibling:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.redaiSibling:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
  '.redaiSiblingName{min-width:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.redaiSibling:hover .redaiSiblingName{color:var(--dsw-alias-label-primary)}',
  '.redaiSiblingHost{min-width:0;font-size:10px;line-height:15px;color:light-dark(#61666b,var(--dsw-alias-label-tertiary));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.redaiSiblingEmpty{margin:4px 0 0;padding-left:9px;font-size:11px;line-height:16px;color:light-dark(#61666b,var(--dsw-alias-label-tertiary))}',
  // The three fixed facts of a site: same cell rhythm as the editorial fact grid
  // but its own classes, because these are computed, not curated.
  '.redaiInfoGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1px;margin:0;background:var(--dsw-alias-border-l1);border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden}',
  '.redaiInfoCell{min-width:0;margin:0;padding:9px 12px;background:var(--dsw-alias-bg-base)}',
  '.redaiInfoLabel{margin:0;font-size:10px;line-height:15px;letter-spacing:.05em;color:light-dark(#61666b,var(--dsw-alias-label-tertiary))}',
  '.redaiInfoValue{margin:2px 0 0;font-size:13px;line-height:19px;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}',
  '.redaiInfoTags{display:flex;flex-wrap:wrap;align-items:center;gap:4px;min-height:19px}',
  '.redaiDocBody{min-width:0}',
  '.redaiDocSection{padding-top:18px;scroll-margin-top:44px}',
  '.redaiDocSection+.redaiDocSection{margin-top:2px;border-top:.5px solid var(--dsw-alias-border-l1)}',
  '.redaiDocH2{margin:0 0 10px;font-size:13px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-primary)}',
  '.redaiDocP{margin:0 0 10px;font-size:13px;line-height:23px;color:var(--dsw-alias-label-secondary)}',
  '.redaiDocP.lead{font-size:14px;line-height:24px;color:var(--dsw-alias-label-primary)}',
  '.redaiFactGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;margin:0;background:var(--dsw-alias-border-l1);border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden}',
  '.redaiFactCell{margin:0;padding:9px 12px;background:var(--dsw-alias-bg-base)}',
  '.redaiFactLabel{margin:0;font-size:10px;line-height:15px;letter-spacing:.05em;color:var(--dsw-alias-label-tertiary)}',
  '.redaiFactValue{margin:2px 0 0;font-size:13px;line-height:19px;color:var(--dsw-alias-label-primary)}',
  '.redaiCapList{display:flex;flex-direction:column;gap:2px}',
  '.redaiCapRow{padding:7px 0}',
  '.redaiCapGroup{font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-primary)}',
  '.redaiCapItems{display:flex;flex-wrap:wrap;gap:3px 16px;margin:3px 0 0;padding:0;list-style:none}',
  '.redaiCapItem{position:relative;padding-left:11px;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary)}',
  '.redaiCapItem::before{content:"";position:absolute;left:0;top:9px;width:4px;height:4px;border-radius:50%;background:var(--dsw-alias-border-l2,rgba(0,0,0,.2))}',
  '.redaiLimitList{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}',
  '.redaiLimitItem{position:relative;padding-left:14px;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary)}',
  '.redaiLimitItem::before{content:"";position:absolute;left:2px;top:9px;width:5px;height:1.5px;border-radius:1px;background:var(--dsw-alias-state-warn-label,#d33)}',
  '.redaiModeList{display:flex;flex-direction:column}',
  '.redaiModeRow{display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px;padding:5px 0;font-size:12px;line-height:19px}',
  '.redaiModeName{font-weight:500;color:var(--dsw-alias-label-primary)}',
  '.redaiModeDesc{color:var(--dsw-alias-label-secondary)}',
  '.redaiModelList{display:flex;flex-direction:column}',
  '.redaiModelRow{display:grid;grid-template-columns:minmax(0,150px) auto minmax(0,1fr);gap:10px;align-items:baseline;padding:7px 0;border-top:.5px solid var(--dsw-alias-border-l1)}',
  '.redaiModelRow:first-child{border-top:0;padding-top:0}',
  '.redaiModelName{font-size:12px;line-height:19px;font-weight:500;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.redaiModelKind{padding:0 5px;font-size:10px;line-height:15px;border-radius:4px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l1)}',
  '.redaiModelNote{font-size:12px;line-height:19px;color:var(--dsw-alias-label-tertiary)}',
  '.redaiNote{position:relative;margin:0 0 7px;padding-left:22px;font-size:12px;line-height:21px;color:var(--dsw-alias-label-secondary)}',
  '.redaiNoteNum{position:absolute;left:0;top:2px;width:16px;font-size:10px;line-height:16px;text-align:center;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
  '.redaiDocFoot{margin-top:26px;padding-top:12px;border-top:.5px solid var(--dsw-alias-border-l1);font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',
  // Chrome borrowed from the docs quickstart: where you are, and how to keep going.
  '.redaiCrumb{display:flex;align-items:center;gap:6px;margin:10px 0 0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}',
  '.redaiCrumbSep{color:var(--dsw-alias-label-tertiary)}',
  '.redaiPager{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:26px}',
  '.redaiPagerSlot{display:block}',
  '.redaiPagerBtn{display:flex;flex-direction:column;gap:1px;min-width:0;padding:7px 10px;font:inherit;text-align:left;color:inherit;background:transparent;border:.5px solid var(--dsw-alias-border-l1);border-radius:8px;cursor:pointer;transition:background .12s ease}',
  '.redaiPagerBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.redaiPagerBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
  '.redaiPagerBtn.next{text-align:right;align-items:flex-end}',
  '.redaiPagerLabel{font-size:10px;line-height:15px;color:light-dark(#61666b,var(--dsw-alias-label-tertiary))}',
  '.redaiPagerName{max-width:100%;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.redaiContribute{margin-top:14px;font-size:11px;line-height:16px}',
  '.redaiFootLink{color:var(--dsw-alias-label-secondary);text-decoration:underline;text-underline-offset:2px}',
  '.redaiFootLink:hover{color:var(--dsw-alias-label-primary)}',
  '.redaiFootLink:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
  '@container (max-width:520px){.redaiPager{grid-template-columns:minmax(0,1fr)}}',
  '.redaiTocTitle{margin-bottom:8px;font-size:10px;line-height:15px;letter-spacing:.06em;color:light-dark(#61666b,var(--dsw-alias-label-tertiary))}',
  '.redaiTocLink{display:block;padding:2px 0 2px 9px;font-size:12px;line-height:19px;color:var(--dsw-alias-label-secondary);text-decoration:none;border-left:2px solid transparent}',
  '.redaiTocLink:hover{color:var(--dsw-alias-label-primary);border-left-color:var(--dsw-alias-border-l2,rgba(0,0,0,.2))}',
  '.redaiTocLink:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
  // The rail is the only thing the wide layout adds. `redaiDocWideHidden` marks
  // a body block the rail already carries; the page only puts it there when the
  // rail also has a contents list, so a short page keeps its group section.
  '@container (min-width:720px){.redaiDoc{grid-template-columns:172px minmax(0,1fr);gap:36px}.redaiDocRail{display:block;position:sticky;top:44px;align-self:start;padding-top:18px}.redaiDocWideHidden{display:none}}',
  // One column of cards once the panel is too narrow to hold two readable ones;
  // and the header gives up its width cap rather than being clipped by it.
  '@container (max-width:520px){.redaiModeRow{grid-template-columns:minmax(0,1fr);gap:1px}.redaiModelRow{grid-template-columns:minmax(0,1fr) auto;gap:2px 10px}.redaiModelNote{grid-column:1 / -1}.redaiSiblingGrid{grid-template-columns:minmax(0,1fr)}.redaiDetailTop{max-width:none}}',
  '.redaiLink{font-size:12px;line-height:18px;color:var(--dsw-alias-link,var(--dsw-alias-brand-primary));text-decoration:none;padding:2px 0}.redaiLink:hover{text-decoration:underline;text-underline-offset:3px;text-decoration-style:dotted}',
  '.redaiTabs{display:flex;gap:2px;padding:8px 24px 0;border-bottom:.5px solid var(--dsw-alias-border-l1)}.redaiTab{position:relative;height:30px;padding:0 10px;font:inherit;font-size:13px;line-height:30px;color:var(--dsw-alias-label-secondary);background:transparent;border:0;border-radius:6px 6px 0 0;cursor:pointer}',
  '.redaiTab:hover{background:var(--dsw-alias-interactive-bg-hover)}.redaiTab.on{color:var(--dsw-alias-label-primary);font-weight:600}',
  // Same reason as the filter chips: the UA outline is invisible on the dark page.
  '.redaiTab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
  '.redaiTab.on::after{content:"";position:absolute;left:8px;right:8px;bottom:-.5px;height:2px;background:var(--dsw-alias-brand-primary);border-radius:1px}.redaiTabCount{margin-left:5px;font-size:11px;font-weight:400;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
  '@keyframes redaiOdo{from{transform:translateY(100%);opacity:.35}to{transform:none;opacity:1}}@keyframes redaiRail{from{transform:scaleY(.2);opacity:0}to{transform:scaleY(1);opacity:1}}',
  '@keyframes redaiStarPop{0%{transform:scale(.86)}55%{transform:scale(1.14)}100%{transform:scale(1)}}@keyframes redaiDust{0%{opacity:.95;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(.3)}}',
  '@keyframes redaiToastIn{from{transform:translateY(6px);opacity:0}to{transform:none;opacity:1}}@keyframes redaiPopIn{from{transform:scale(.97);opacity:0}to{transform:none;opacity:1}}',
  // One global opt-out: every animation and transition inside the page collapses
  // to a single 1ms frame, so the UI still works with reduced motion enabled.
  '@media (prefers-reduced-motion: reduce){.redaiNavPage *,.redaiNavPage *::before,.redaiNavPage *::after{animation-duration:1ms!important;animation-iteration-count:1!important;transition-duration:1ms!important}}',
]

/** Offsets of the four dust motes, published to CSS as custom properties. */
const DUST_OFFSETS = [
  { key: 'a', dx: '7px', dy: '-7px' },
  { key: 'b', dx: '8px', dy: '2px' },
  { key: 'c', dx: '2px', dy: '9px' },
  { key: 'd', dx: '-5px', dy: '7px' },
]

/**
 * Star toggle shared by the card and the detail header.
 * `dust` is only passed by the card: the detail header has no room for motes.
 */
function StarButton({ t, starred, onClick, dust }) {
  return jsxs('button', {
    type: 'button',
    className: 'redaiNavStar' + (starred ? ' on' : ''),
    'aria-pressed': starred ? 'true' : 'false',
    title: starred ? t('action.unstar') : t('action.star'),
    'aria-label': starred ? t('action.unstar') : t('action.star'),
    onClick,
    children: [
      jsx('span', { key: 'glyph', className: 'redaiNavGlyph', children: starred ? '★' : '☆' }),
      dust || null,
    ],
  })
}

/**
 * One site card.
 *
 * Clicking opens the site; the ⓘ control is the only way into the detail page.
 * A modifier click is left entirely alone so ⌘/Ctrl+click keeps the shell's
 * new-tab behaviour instead of being swallowed by preventDefault().
 */
function SiteCard({ link, onActivate, onDetail, onStar, onRemove, starred, active, t, tags }) {
  // 0 means "no dust", which also keeps the first render free of decoration.
  const [dustKey, setDustKey] = React.useState(0)

  const onCardClick = (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onActivate(link)
  }

  const onStarClick = (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (!starred) setDustKey(dustKey + 1)
    onStar(link)
  }

  return jsxs('a', {
    className: 'redaiNavCard' + (active ? ' redaiNavCardActive' : ''),
    href: link.url,
    title: link.url,
    'data-active': active ? 'true' : undefined,
    onClick: onCardClick,
    children: [
      jsx('span', {
        key: 'tile',
        className: 'redaiNavTile',
        style: tileStyle(link.title),
        children: link.title.slice(0, 1).toUpperCase(),
      }),
      jsxs('div', {
        key: 'meta',
        className: 'redaiNavMeta',
        children: [
          jsxs('div', {
            key: 't',
            className: 'redaiNavTitleRow',
            children: [
              jsx('span', { key: 'name', className: 'redaiNavTitle', children: link.title }),
              ...(tags || []).map((tag) => jsx('span', {
                key: tag.key,
                className: 'redaiTagPill ' + tag.key,
                children: tag.label,
              })),
            ],
          }),
          jsxs('div', {
            key: 'line',
            className: 'redaiNavMetaLine' + (link.desc ? '' : ' solo'),
            children: [
              link.desc
                ? jsx('span', { key: 'd', className: 'redaiNavDesc', children: link.desc })
                : null,
              jsx('span', { key: 'h', className: 'redaiNavHost', children: urlHost(link.url) }),
            ],
          }),
        ],
      }),
      onDetail
        ? jsx('button', {
          key: 'info',
          type: 'button',
          className: 'redaiNavInfo',
          title: t('action.detail'),
          'aria-label': t('action.detail'),
          onClick: (event) => {
            event.preventDefault()
            event.stopPropagation()
            onDetail(link)
          },
          children: 'ⓘ',
        })
        : null,
      jsx(StarButton, {
        key: 'star',
        t,
        starred,
        onClick: onStarClick,
        dust: dustKey > 0
          ? jsx('span', {
            key: 'dust',
            className: 'redaiDust',
            'aria-hidden': 'true',
            onAnimationEnd: () => setDustKey(0),
            children: DUST_OFFSETS.map((mote) => jsx('i', {
              key: mote.key,
              style: { '--dx': mote.dx, '--dy': mote.dy },
            })),
          })
          : null,
      }),
      onRemove
        ? jsx('button', {
          key: 'del',
          type: 'button',
          className: 'redaiNavDel',
          title: t('action.remove'),
          'aria-label': t('action.remove'),
          onClick: (event) => {
            event.preventDefault()
            event.stopPropagation()
            onRemove(link)
          },
          children: '×',
        })
        : null,
    ],
  })
}

/** First-screen banner introducing the plugin itself. */
function Banner({ t, onCta, onClose, sites, groups }) {
  return jsxs('div', {
    className: 'redaiBanner',
    children: [
      jsxs('div', {
        key: 'text',
        className: 'redaiBannerText',
        children: [
          jsx('div', { key: 'k', className: 'redaiBannerKicker', children: t('banner.kicker') }),
          jsx('div', { key: 't', className: 'redaiBannerTitle', children: t('banner.title') }),
          // Counts come from the data, never from a number typed into the copy.
          jsx('div', {
            key: 'd',
            className: 'redaiBannerDesc',
            children: fill(t('banner.desc'), { n: sites, g: groups }),
          }),
          jsx('button', {
            key: 'cta',
            type: 'button',
            className: 'redaiBannerCta',
            onClick: onCta,
            children: t('banner.cta'),
          }),
        ],
      }),
      jsx('svg', {
        key: 'art',
        className: 'redaiBannerArt',
        viewBox: '0 0 132 80',
        fill: 'none',
        'aria-hidden': 'true',
        children: [
          jsx('rect', { key: 'b1', x: 6, y: 34, width: 120, height: 40, rx: 8, fill: 'var(--dsw-alias-bg-base)', stroke: 'var(--dsw-alias-border-l1)' }),
          jsx('rect', { key: 'b2', x: 14, y: 20, width: 104, height: 34, rx: 7, fill: 'var(--dsw-alias-bg-base)', stroke: 'var(--dsw-alias-border-l1)' }),
          jsx('rect', { key: 'b3', x: 22, y: 6, width: 88, height: 30, rx: 6, fill: 'var(--dsw-alias-bg-base)', stroke: 'var(--dsw-alias-border-l1)' }),
          jsx('rect', { key: 't1', x: 14, y: 42, width: 14, height: 14, rx: 4, fill: 'var(--dsw-alias-brand-primary)', opacity: 0.85 }),
          jsx('rect', { key: 't2', x: 33, y: 44, width: 46, height: 4, rx: 2, fill: 'var(--dsw-alias-label-tertiary)', opacity: 0.45 }),
          jsx('rect', { key: 't3', x: 33, y: 52, width: 30, height: 3, rx: 1.5, fill: 'var(--dsw-alias-label-tertiary)', opacity: 0.25 }),
          jsx('rect', { key: 't4', x: 22, y: 26, width: 12, height: 12, rx: 3, fill: 'var(--dsw-alias-brand-primary)', opacity: 0.5 }),
          jsx('rect', { key: 't5', x: 39, y: 28, width: 34, height: 4, rx: 2, fill: 'var(--dsw-alias-label-tertiary)', opacity: 0.35 }),
          jsx('text', { key: 's', x: 100, y: 24, fontSize: 18, fill: 'light-dark(#aa7a00,#f0b429)', children: '★' }),
        ],
      }),
      jsx('button', {
        key: 'close',
        type: 'button',
        className: 'redaiBannerClose',
        title: t('banner.off'),
        'aria-label': t('banner.off'),
        onClick: onClose,
        children: '×',
      }),
    ],
  })
}

/** One titled block of a detail page; body is the list of child nodes. */
function detailSection(key, title, body, titleClass) {
  return jsxs('section', {
    key,
    className: 'redaiSection',
    children: [
      jsx('h2', { key: 'h', className: 'redaiSectionTitle' + (titleClass ? ' ' + titleClass : ''), children: title }),
      ...body,
    ],
  })
}

/** Stand-in for a fact the record cannot answer, so the row still lines up. */
const DASH = '—'
/** How many sites of the same group the rail and the inline block may list. */
const SIBLING_MAX = 6
/** Below this many entries a contents list restates the headings it points at. */
const TOC_MIN = 4

/**
 * Detail page for one site.
 *
 * Editorial content is optional — `data/details.json` only covers the sites
 * someone wrote about, and the other 87 still need an answer when their ⓘ is
 * clicked. So the document opens with three sections every site can fill from
 * fields the list already holds: what it is (`intro`, else the curated `desc`),
 * what the record says (domain, group, status, star), and the rest of its group.
 * The editorial blocks are appended after those, in judgement order, and only
 * when they carry data. Nothing here invents copy: a missing field is either
 * left out or shown as a dash.
 */
/** Where a reader goes to add the editorial copy a skeleton page is missing. */
const CONTRIBUTE_URL = 'https://github.com/QingshanYousi/DSH-Plugin-RedAi-Nav/edit/main/data/details.json'

function SiteDetail({ link, detail, groupTitle, siblings, neighbours, t, starred, onStar, onVisit, onDetail, onBack }) {
  const data = detail || {}
  const intro = Array.isArray(data.intro) ? data.intro : []
  const facts = Array.isArray(data.facts) ? data.facts : []
  const capabilities = Array.isArray(data.capabilities) ? data.capabilities : []
  const limits = Array.isArray(data.limits) ? data.limits : []
  const steps = Array.isArray(data.steps) ? data.steps : []
  const modes = Array.isArray(data.modes) ? data.modes : []
  const scenarios = Array.isArray(data.scenarios) ? data.scenarios : []
  const models = Array.isArray(data.models) ? data.models : []
  const highlights = Array.isArray(data.highlights) ? data.highlights : []
  const links = Array.isArray(data.links) ? data.links : []
  const editorialTags = Array.isArray(data.tags) ? data.tags : []
  const tags = statusTags(link, t, Date.now())
  // The page you are reading is never one of the destinations it lists, so the
  // current site is filtered out before the six-row budget is applied — not after.
  const groupLinks = Array.isArray(siblings) ? siblings : []
  const others = groupLinks
    .filter((row) => row && row.url && row.url !== link.url)
    .slice(0, SIBLING_MAX)

  const body = []
  const toc = []
  const addSection = (key, title, node, options) => {
    const opts = options || {}
    // `toc: false` marks the inline copy of the group list: it is navigation,
    // not content, so it never becomes an entry that could scroll to a block
    // the wide layout does not even render.
    if (opts.toc !== false) toc.push({ key, title })
    body.push(jsxs('section', {
      key,
      id: 'redai-sec-' + key,
      // `wideHidden` says "the rail already carries this": only the group list
      // gets it, and only when the rail has a contents list to pair it with.
      className: 'redaiDocSection' + (opts.wideHidden ? ' redaiDocWideHidden' : ''),
      children: [
        jsx('h2', { key: 'h', className: 'redaiDocH2', children: title }),
        node,
      ],
    }))
  }
  /** Scrolls the section into view without touching the URL hash. */
  const jump = (event, key) => {
    event.preventDefault()
    if (typeof document === 'undefined') return
    const node = document.getElementById('redai-sec-' + key)
    if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'start' })
  }
  /** One labelled cell of the computed facts grid. */
  const infoCell = (key, label, value) => jsxs('div', {
    key,
    className: 'redaiInfoCell',
    children: [
      jsx('dt', { key: 'l', className: 'redaiInfoLabel', children: label }),
      jsx('dd', {
        key: 'v',
        className: 'redaiInfoValue' + (key === 'status' ? ' redaiInfoTags' : ''),
        children: value,
      }),
    ],
  })
  /**
   * One sibling row: the whole row is the target, the host is the fine print.
   * The body copy carries the list's own description; the rail copy stays two
   * lines tall so six of them fit in a 164px column.
   *
   * The click rule is the cards' rule, unchanged: every site has a page, so a
   * sibling always opens that page. `onVisit` survives only as the fallback for
   * a renderer that hands the document no detail handler at all — keying off
   * `DETAILS` here would have sent 87 of 88 rows straight out of the panel and
   * contradicted the reason the skeleton exists.
   */
  const siblingLink = (row, withDesc) => jsxs('a', {
    className: 'redaiSibling',
    href: row.url,
    title: row.url,
    onClick: (event) => {
      event.preventDefault()
      if (typeof onDetail === 'function') onDetail(row)
      else onVisit(row.url)
    },
    children: [
      jsx('span', { key: 'n', className: 'redaiSiblingName', children: row.title }),
      withDesc && row.desc
        ? jsx('span', { key: 'd', className: 'redaiSiblingDesc', children: row.desc })
        : null,
      jsx('span', { key: 'h', className: 'redaiSiblingHost', children: urlHost(row.url) }),
    ],
  })
  /**
   * The group list, in both of the shapes the page uses: the rail's compact one,
   * and the body's fuller one (cards with the description the list ships).
   * Null when the group has no other site — the sentence that says so is spoken
   * once, by the body, so the rail degrades to its heading and the current line
   * rather than repeating it in a second column.
   */
  const siblingList = (listClass, withDesc) => (others.length === 0 ? null : jsx('ul', {
    className: listClass,
    children: others.map((row) => jsx('li', {
      key: row.url,
      children: siblingLink(row, withDesc),
    })),
  }))
  /** The single copy of "this group has no other site yet". */
  const siblingsEmpty = () => jsx('p', {
    className: 'redaiSiblingEmpty',
    children: t('detail.siblingsEmpty'),
  })

  // 1. What it is. With no write-up the list's own description is the only real
  //    sentence we have; with neither, the section says exactly that.
  const introText = intro.length > 0 ? intro : [link.desc || t('detail.introFallback')]
  // The header's one-liner. When the intro *is* the list's description, printing
  // the same sentence again right below it reads like a bug, so in that case the
  // header keeps the title and lets the section carry the words.
  const tagline = data.tagline || (intro.length > 0 ? link.desc || '' : '')
  addSection('intro', t('detail.intro'), introText.map((text, index) => jsx('p', {
    key: 'p' + index,
    className: index === 0 ? 'redaiDocP lead' : 'redaiDocP',
    children: text,
  })))

  // 2. What the record says — every value below is read, never written.
  addSection('info', t('detail.info'), jsx('dl', {
    className: 'redaiInfoGrid',
    children: [
      infoCell('domain', t('detail.field.domain'), urlHost(link.url)),
      infoCell('group', t('detail.field.group'), groupTitle || DASH),
      infoCell('status', t('detail.field.status'), tags.length > 0
        ? tags.map((tag) => jsx('span', {
          key: tag.key,
          className: 'redaiTagPill ' + tag.key,
          children: tag.label,
        }))
        : DASH),
      infoCell('starred', t('detail.field.starred'), starred ? t('detail.starredYes') : t('detail.starredNo')),
    ],
  }))

  if (facts.length > 0) {
    addSection('facts', t('detail.facts'), jsx('dl', {
      className: 'redaiFactGrid',
      children: facts.map((row, index) => jsxs('div', {
        key: 'f' + index,
        className: 'redaiFactCell',
        children: [
          jsx('dt', { key: 'l', className: 'redaiFactLabel', children: row.label }),
          jsx('dd', { key: 'v', className: 'redaiFactValue', children: row.value }),
        ],
      })),
    }))
  }

  if (capabilities.length > 0) {
    addSection('capabilities', t('detail.capabilities'), jsx('div', {
      className: 'redaiCapList',
      children: capabilities.map((group, index) => jsxs('div', {
        key: 'g' + index,
        className: 'redaiCapRow',
        children: [
          jsx('div', { key: 'n', className: 'redaiCapGroup', children: group.group }),
          jsx('ul', {
            key: 'u',
            className: 'redaiCapItems',
            children: (group.items || []).map((text, i) => jsx('li', {
              key: 'i' + i,
              className: 'redaiCapItem',
              children: text,
            })),
          }),
        ],
      })),
    }))
  }

  if (limits.length > 0) {
    addSection('limits', t('detail.limits'), jsx('ul', {
      className: 'redaiLimitList',
      children: limits.map((text, index) => jsx('li', {
        key: 'l' + index,
        className: 'redaiLimitItem',
        children: text,
      })),
    }))
  }

  if (steps.length > 0) {
    addSection('steps', t('detail.steps'), steps.map((text, index) => jsxs('p', {
      key: 's' + index,
      className: 'redaiStep',
      children: [
        jsx('span', { key: 'n', className: 'redaiStepNum', children: String(index + 1) }),
        text,
      ],
    })))
  }

  if (modes.length > 0) {
    addSection('modes', t('detail.modes'), jsx('div', {
      className: 'redaiModeList',
      children: modes.map((row, index) => jsxs('div', {
        key: 'm' + index,
        className: 'redaiModeRow',
        children: [
          jsx('div', { key: 'n', className: 'redaiModeName', children: row.name }),
          jsx('div', { key: 'd', className: 'redaiModeDesc', children: row.desc }),
        ],
      })),
    }))
  }

  if (scenarios.length > 0) {
    addSection('scenarios', t('detail.scenarios'), scenarios.map((row, index) => jsxs('div', {
      key: 'c' + index,
      className: 'redaiScenario',
      children: [
        jsx('div', { key: 'i', className: 'redaiScenarioIcon', children: row.icon || '•' }),
        jsxs('div', {
          key: 'b',
          children: [
            jsx('div', { key: 't', className: 'redaiScenarioTitle', children: row.title }),
            jsx('div', { key: 'd', className: 'redaiScenarioDesc', children: row.desc }),
          ],
        }),
      ],
    })))
  }

  if (models.length > 0) {
    addSection('models', t('detail.models'), jsx('div', {
      className: 'redaiModelList',
      children: models.map((row, index) => jsxs('div', {
        key: 'o' + index,
        className: 'redaiModelRow',
        children: [
          jsx('div', { key: 'n', className: 'redaiModelName', children: row.name }),
          row.kind ? jsx('span', { key: 'k', className: 'redaiModelKind', children: row.kind }) : null,
          jsx('div', { key: 'd', className: 'redaiModelNote', children: row.note }),
        ],
      })),
    }))
  }

  if (highlights.length > 0) {
    addSection('highlights', t('detail.highlights'), highlights.map((text, index) => jsxs('p', {
      key: 'h' + index,
      className: 'redaiNote',
      children: [
        jsx('span', { key: 'n', className: 'redaiNoteNum', children: String(index + 1) }),
        text,
      ],
    })))
  }

  if (links.length > 0) {
    addSection('links', t('detail.links'), jsx('div', {
      className: 'redaiLinks',
      children: links.map((row, index) => jsx('a', {
        key: 'l' + index,
        className: 'redaiLink',
        href: row.url,
        onClick: (event) => {
          event.preventDefault()
          onVisit(row.url)
        },
        children: row.label,
      })),
    }))
  }

  // 3. The rest of the group. Last in the body because it is the only section
  //    that sends you somewhere else. The rail shows the same list, so the body
  //    copy is only dropped when the rail pairs it with a contents list; on a
  //    page too short for a contents list this section is substance, not a
  //    repeat, and it fills what would otherwise be half a screen of nothing.
  //    A one-site group has nothing for the rail to list, so the body keeps the
  //    section at every width — it is where the empty sentence lives.
  const hasContents = toc.length >= TOC_MIN
  addSection('siblings', t('detail.siblings'), siblingList('redaiSiblingGrid', true) || siblingsEmpty(), {
    toc: false,
    wideHidden: hasContents && others.length > 0,
  })

  // 4. Tail blocks belong to the reading column, not to the page: outside the
  //    grid they would start at the rail's left edge and break the line the
  //    reader is following. Pager first (keep reading), then the way to fill a
  //    skeleton page, then the date stamp.
  if (neighbours && (neighbours.prev || neighbours.next)) {
    body.push(jsxs('nav', {
      key: 'pager',
      className: 'redaiPager',
      'aria-label': t('detail.pager'),
      children: [
        neighbours.prev
          ? jsxs('button', {
            key: 'prev',
            type: 'button',
            className: 'redaiPagerBtn',
            onClick: () => (typeof onDetail === 'function' ? onDetail(neighbours.prev) : onVisit(neighbours.prev.url)),
            children: [
              jsx('span', { key: 'l', className: 'redaiPagerLabel', children: '← ' + t('detail.prev') }),
              jsx('span', { key: 'n', className: 'redaiPagerName', children: neighbours.prev.title }),
            ],
          })
          : jsx('span', { key: 'prev', className: 'redaiPagerSlot' }),
        neighbours.next
          ? jsxs('button', {
            key: 'next',
            type: 'button',
            className: 'redaiPagerBtn next',
            onClick: () => (typeof onDetail === 'function' ? onDetail(neighbours.next) : onVisit(neighbours.next.url)),
            children: [
              jsx('span', { key: 'l', className: 'redaiPagerLabel', children: t('detail.next') + ' →' }),
              jsx('span', { key: 'n', className: 'redaiPagerName', children: neighbours.next.title }),
            ],
          })
          : jsx('span', { key: 'next', className: 'redaiPagerSlot' }),
      ],
    }))
  }
  // A skeleton page admits it is a skeleton, and offers the one fix that costs
  // the reader nothing: open the data file on GitHub and add the write-up.
  if (intro.length === 0) {
    body.push(jsx('div', {
      key: 'contribute',
      className: 'redaiContribute',
      children: jsx('a', {
        className: 'redaiFootLink',
        href: CONTRIBUTE_URL,
        onClick: (event) => {
          event.preventDefault()
          onVisit(CONTRIBUTE_URL)
        },
        children: t('detail.contribute'),
      }),
    }))
  }
  if (data.asOf) {
    body.push(jsx('div', {
      key: 'asof',
      className: 'redaiDocFoot',
      children: fill(t('detail.asOf'), { date: data.asOf }),
    }))
  }

  return jsxs('div', {
    className: 'redaiDetail',
    children: [
      jsx('button', {
        key: 'back',
        type: 'button',
        className: 'redaiGhost',
        onClick: onBack,
        children: '← ' + t('detail.back'),
      }),
      // Where you are, in the list's own words. The group is not a link: the
      // panel has no group-level view to go back to, so a fake link would lie.
      groupTitle
        ? jsxs('div', {
          key: 'crumb',
          className: 'redaiCrumb',
          children: [
            jsx('span', { key: 'root', children: t('detail.crumbRoot') }),
            jsx('span', { key: 'sep', className: 'redaiCrumbSep', children: '/' }),
            jsx('span', { key: 'group', children: groupTitle }),
          ],
        })
        : null,
      jsxs('div', {
        key: 'top',
        className: 'redaiDetailTop',
        style: { marginTop: 14 },
        children: [
          jsx('div', {
            key: 'icon',
            className: 'redaiDetailIcon',
            style: tileStyle(link.title),
            children: link.title.slice(0, 1).toUpperCase(),
          }),
          jsxs('div', {
            key: 'head',
            className: 'redaiDetailHead',
            children: [
              jsx('div', { key: 't', className: 'redaiDetailTitle', children: link.title }),
              (tagline)
                ? jsx('div', { key: 'g', className: 'redaiDetailTagline', children: tagline })
                : null,
              (tags.length > 0 || editorialTags.length > 0)
                ? jsx('div', {
                  key: 'tags',
                  className: 'redaiDetailTags',
                  children: [
                    ...tags.map((tag) => jsx('span', {
                      key: 'status:' + tag.key,
                      className: 'redaiTagPill ' + tag.key,
                      children: tag.label,
                    })),
                    ...editorialTags.map((tag) => jsx('span', { key: tag, className: 'redaiTag', children: tag })),
                  ],
                })
                : null,
            ],
          }),
          jsx(StarButton, {
            key: 'star',
            t,
            starred,
            onClick: () => onStar(link),
          }),
        ],
      }),
      jsxs('div', {
        key: 'bar',
        className: 'redaiDetailBar',
        children: [
          jsx('button', {
            key: 'visit',
            type: 'button',
            className: 'redaiPrimary',
            onClick: () => onVisit(link.url),
            children: t('detail.visit'),
          }),
          jsx('span', {
            key: 'host',
            className: 'redaiDocHost',
            children: urlHost(link.url),
          }),
        ],
      }),
      jsxs('div', {
        key: 'doc',
        className: 'redaiDoc',
        children: [
          // The rail: two blocks, both of which are navigation, never content.
          // It is the wide-panel layout and the only place the contents list
          // lives; the group list is repeated inline for the narrow layout.
          jsxs('div', {
            key: 'rail',
            className: 'redaiDocRail',
            children: [
              // Three entries restate the page you are already reading; four is
              // where a contents list starts saving a scroll. The same boolean
              // also decides whether the body keeps its own copy of the group.
              hasContents
                ? jsxs('nav', {
                  key: 'toc',
                  className: 'redaiDocToc',
                  'aria-label': t('detail.toc'),
                  children: [
                    jsx('div', { key: 'l', className: 'redaiTocTitle', children: t('detail.toc') }),
                    ...toc.map((row) => jsx('a', {
                      key: row.key,
                      className: 'redaiTocLink',
                      href: '#redai-sec-' + row.key,
                      onClick: (event) => jump(event, row.key),
                      children: row.title,
                    })),
                  ],
                })
                : null,
              jsxs('nav', {
                key: 'siblings',
                className: 'redaiRailNav',
                'aria-label': t('detail.siblings'),
                children: [
                  jsx('div', {
                    key: 'l',
                    className: 'redaiTocTitle',
                    children: groupTitle
                      ? t('detail.siblings') + ' · ' + groupTitle
                      : t('detail.siblings'),
                  }),
                  // The current site is named here instead of being listed as a
                  // link to itself — that is what `aria-current` marks up.
                  jsx('div', {
                    key: 'here',
                    className: 'redaiRailHere',
                    'aria-current': 'page',
                    title: link.title,
                    children: fill(t('detail.current'), { title: link.title }),
                  }),
                  siblingList('redaiSiblingList'),
                ],
              }),
            ],
          }),
          jsx('div', { key: 'body', className: 'redaiDocBody', children: body }),
        ],
      }),
    ],
  })
}

/**
 * Counter that rolls whenever its label changes.
 *
 * The keyed wrapper remounts the number so the CSS animation replays — cheaper
 * and steadier than animating two values against each other. The label stays a
 * plain string so the element still reads as text for tests and screen readers.
 */
function Count({ n, text }) {
  const label = typeof text === 'string' ? text : String(n === undefined ? '' : n)
  return jsx('span', {
    className: 'redaiCountBox',
    key: label,
    children: jsx('span', { className: 'redaiNavCount', children: label }),
  })
}
