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
  '.redaiDetail{flex:1 1 auto;min-width:0;padding-top:8px}.redaiDetail>.redaiGhost{position:sticky;top:0;z-index:2;background:var(--dsw-alias-bg-base);margin-left:-2px}',
  '.redaiDetailTop{display:flex;align-items:flex-start;gap:12px}.redaiDetailIcon{flex:none;display:grid;place-items:center;width:46px;height:46px;border-radius:12px;font-size:20px;font-weight:600;color:#fff}',
  '.redaiDetailHead{flex:1;min-width:0}.redaiDetailTitle{font-size:17px;line-height:24px;font-weight:600}',
  '.redaiDetailTagline{margin-top:2px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.redaiDetailTags{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
  '.redaiTag{padding:2px 8px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:999px}.redaiDetailBar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:14px}',
  '.redaiPrimary{height:30px;padding:0 14px;font:inherit;font-size:13px;line-height:28px;color:var(--dsw-alias-label-primary-inverted,#fff);background:var(--dsw-alias-button-primary-fill,#4d6bfe);border:0;border-radius:7px;cursor:pointer}.redaiPrimary:hover{background:var(--dsw-alias-button-primary-hover,#3f5bea)}',
  '.redaiGhost{height:30px;padding:0 11px;font:inherit;font-size:12px;line-height:28px;color:var(--dsw-alias-label-secondary);background:transparent;border:.5px solid var(--dsw-alias-border-l1);border-radius:7px;cursor:pointer}.redaiGhost:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  '.redaiSection{margin-top:18px}.redaiSectionTitle{margin:0 0 8px;font-size:13px;line-height:20px;font-weight:600}',
  '.redaiP{margin:0 0 9px;font-size:13px;line-height:22px;color:var(--dsw-alias-label-secondary)}.redaiScenario{display:flex;gap:9px;padding:7px 0}',
  '.redaiScenarioIcon{flex:none;width:20px;font-size:14px;line-height:20px}.redaiScenarioTitle{font-size:13px;line-height:20px;font-weight:500}',
  '.redaiScenarioDesc{margin-top:1px;font-size:12px;line-height:19px;color:var(--dsw-alias-label-tertiary)}.redaiStep{position:relative;margin:0 0 6px;padding-left:22px;font-size:13px;line-height:21px;color:var(--dsw-alias-label-secondary)}',
  '.redaiStepNum{position:absolute;left:0;top:1px;display:grid;place-items:center;width:16px;height:16px;font-size:10px;line-height:1;color:var(--dsw-alias-label-tertiary);border:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.18));border-radius:50%;font-variant-numeric:tabular-nums}.redaiLinks{display:flex;flex-wrap:wrap;gap:8px}',
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

/** Detail page for a site that ships editorial content. */
function SiteDetail({ link, detail, t, starred, onStar, onVisit, onBack }) {
  const intro = detail.intro || []
  const scenarios = detail.scenarios || []
  const steps = detail.steps || []
  const links = detail.links || []
  const tags = statusTags(link, t, Date.now())

  const sections = []
  if (intro.length > 0) {
    sections.push(detailSection('intro', t('detail.intro'),
      intro.map((text, index) => jsx('p', { key: 'p' + index, className: 'redaiP', children: text }))))
  }
  if (scenarios.length > 0) {
    sections.push(detailSection('scenarios', t('detail.scenarios'), scenarios.map((row, index) => jsxs('div', {
      key: 's' + index,
      className: 'redaiScenario',
      children: [
        jsx('div', { key: 'i', className: 'redaiScenarioIcon', children: row.icon || '•' }),
        jsxs('div', {
          key: 'c',
          children: [
            jsx('div', { key: 't', className: 'redaiScenarioTitle', children: row.title }),
            jsx('div', { key: 'd', className: 'redaiScenarioDesc', children: row.desc }),
          ],
        }),
      ],
    }))))
  }
  if (steps.length > 0) {
    sections.push(detailSection('steps', t('detail.steps'), steps.map((text, index) => jsxs('p', {
      key: 'st' + index,
      className: 'redaiStep',
      children: [
        jsx('span', { key: 'n', className: 'redaiStepNum', children: String(index + 1) }),
        text,
      ],
    }))))
  }
  if (links.length > 0) {
    sections.push(detailSection('links', t('detail.links'), [jsx('div', {
      key: 'l',
      className: 'redaiLinks',
      children: links.map((row) => jsx('a', {
        key: row.url,
        className: 'redaiLink',
        href: row.url,
        onClick: (event) => {
          event.preventDefault()
          onVisit(row.url)
        },
        children: row.label,
      })),
    })]))
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
              jsx('div', { key: 'g', className: 'redaiDetailTagline', children: detail.tagline || link.desc }),
              (tags.length > 0 || (detail.tags && detail.tags.length > 0))
                ? jsx('div', {
                  key: 'tags',
                  className: 'redaiDetailTags',
                  children: [
                    ...tags.map((tag) => jsx('span', {
                      key: 'status:' + tag.key,
                      className: 'redaiTagPill ' + tag.key,
                      children: tag.label,
                    })),
                    ...(detail.tags || []).map((tag) => jsx('span', { key: tag, className: 'redaiTag', children: tag })),
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
            className: 'redaiP',
            style: { margin: 0 },
            children: urlHost(link.url),
          }),
        ],
      }),
      ...sections,
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
