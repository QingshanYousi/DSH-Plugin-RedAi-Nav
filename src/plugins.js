/**
 * Plugin ranking: ordering helpers, the card grid, and the plugin detail page.
 *
 * Fragment rules (see scripts/build.mjs): no `import`/`export`; `jsx`/`jsxs` come
 * from the enclosing factory scope. `React` is never used here on purpose — both
 * components stay pure functions so the offline harness can call them directly.
 */

const cssPlugins = [
  // Ranking chrome. Spacing rhythm: 8 / 10 / 14 / 18, the same as the site list.
  '.redaiPluginNote{display:flex;flex-wrap:wrap;gap:2px 14px;padding:14px 24px 2px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}.redaiPluginFilter{display:flex;flex-wrap:wrap;gap:6px;padding:8px 24px 0}',
  '.redaiFilterChip{position:relative;height:22px;padding:0 9px;font:inherit;font-size:11px;line-height:20px;color:var(--dsw-alias-label-secondary);background:transparent;border:.5px solid var(--dsw-alias-border-l1);border-radius:999px;cursor:pointer;transition:background var(--redai-fast) ease,color var(--redai-fast) ease;font-variant-numeric:tabular-nums}.redaiFilterChip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  // Same 28px pointer target as the recent chips, and the same reason for
  // growing only vertically: they share a 6px gap.
  '.redaiFilterChip::after{content:"";position:absolute;left:0;right:0;top:50%;height:28px;transform:translateY(-50%);border-radius:999px}',
  '.redaiFilterChip[aria-pressed="true"]{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)}.redaiPluginList{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px;padding:8px 24px 28px}',
  '.redaiPluginCard{display:flex;flex-direction:column;gap:8px;min-width:0;padding:10px;font:inherit;text-align:left;color:inherit;background:transparent;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,10px);cursor:pointer;transition:background .12s ease,opacity .12s ease}.redaiPluginCard:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.redaiPluginCard:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
  // Archived, without the card-wide opacity it used to carry. `.62` dimmed the
  // badges along with everything else: `host none` fell to 2.40:1 (light) and
  // 2.82:1 (dark), and this card is still a live button, so WCAG's inactive
  // exemption does not apply. Pulling the wash back to fresh would need opacity
  // 1.00 to clear 4.5 (the wash is only 18% of the text colour, so fading the
  // pair toward the page collapses it fast), which leaves no visual signal at
  // all. So the card is *recessed* instead: a module-platform fill that sits a
  // step away from the page in both themes, plus a fainter hairline. Every glyph
  // keeps full contrast, and the `archived` badge and the bottom-of-list
  // ordering carry the meaning. `bg-layer-1` stays as the fallback for shells
  // that do not publish module-platform — and note that in the light theme
  // layer-1 is the page colour, so with that fallback the fill does nothing;
  // that is exactly why this token exists.
  '.redaiPluginCardArchived{background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-1));border-color:color-mix(in srgb,var(--dsw-alias-border-l1) 55%,transparent)}',
  // Hover stacks the veil on top of the fill instead of replacing it, so the
  // card keeps its archived surface (and the badge keeps the surface it was
  // measured against) while still answering the pointer. The fill token is
  // repeated here on purpose: dropping it would snap the card back to the page
  // colour under the pointer.
  '.redaiPluginCardArchived:hover{background:linear-gradient(var(--dsw-alias-interactive-bg-hover),var(--dsw-alias-interactive-bg-hover)),var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-1));border-color:var(--dsw-alias-border-l1)}',
  // The three neutral badges would otherwise inherit that fill and lose their
  // pill edge. Lift them one step to bg-base, which is the surface on the other
  // side of the recess, so the pill reads in both themes. Scoped on purpose: the
  // six washed badges must keep their own currentColor wash, or the colour that
  // carries the status goes with it.
  // In light bg-base and bg-layer-1 are both white, so the lift is about the edge
  // on a #f5f6f7 card, not about contrast; in dark it is about both (the label
  // reads 10.42:1 on layer-1 and 12.11:1 on bg-base).
  '.redaiPluginCardArchived .redaiBadge.unknown,.redaiPluginCardArchived .redaiBadge.archived,.redaiPluginCardArchived .redaiBadge.cat{background:var(--dsw-alias-bg-base)}',
  '.redaiPluginCardTop{display:flex;align-items:baseline;gap:8px;min-width:0}',
  '.redaiRank{flex:none;width:16px;font-size:11px;line-height:16px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary)}.redaiPluginName{min-width:0;flex:1 1 auto;font-size:13px;line-height:18px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.redaiStars{flex:none;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}.redaiPluginDesc{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
  '.redaiPluginMeta{display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center;font-size:10px;line-height:15px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}.redaiPluginCat{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:auto}',
  '.redaiBadge{flex:none;display:inline-flex;align-items:center;padding:0 5px;font-size:11px;line-height:15px;font-weight:500;border-radius:4px}.redaiBadge.none{color:light-dark(#125736,#8de0b8);background:color-mix(in srgb,currentColor 18%,transparent)}',
  // The host-surface tri-state shares the site cards' green/orange pair so one
  // colour means one thing across both tabs. `unknown` stays a host token (it is
  // a neutral, not a status): the light-dark pair is only the fallback for
  // shells that do not publish the alias. Four-state ratios against the host's
  // real hover token: `yes` 6.13 / 5.55 / 6.65 / 5.34, `unknown` 6.12 / 6.12 /
  // 7.69 / 7.69 — all clearing the 4.9 bar, not just 4.5.
  '.redaiBadge.yes{color:light-dark(#8a3108,#ffc2a5);background:color-mix(in srgb,currentColor 18%,transparent)}.redaiBadge.unknown{color:var(--dsw-alias-label-secondary,light-dark(#5c5c66,#b8b8c2));background:var(--dsw-alias-bg-layer-1)}',
  // Maintained tri-state reuses the same two pairs (green = fine, amber = quiet)
  // so a user learns "green means go" once. Four-state ratios: `new` 6.38 / 5.79
  // / 6.70 / 5.38, `stale` 6.16 / 5.59 / 6.82 / 5.47. Outlines use an inset
  // shadow instead of a border so every badge keeps the same 15px box and the
  // meta rows of neighbouring cards stay level.
  '.redaiBadge.active{color:light-dark(#125736,#8de0b8);background:color-mix(in srgb,currentColor 18%,transparent)}.redaiBadge.stale{color:light-dark(#684900,#f0d089);background:color-mix(in srgb,currentColor 18%,transparent)}',
  '.redaiBadge.archived{color:var(--dsw-alias-label-secondary,light-dark(#5c5c66,#b8b8c2));background:var(--dsw-alias-bg-layer-1);box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l1)}.redaiBadge.cat{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l1)}',
  // The archived card's own fill is a host token we do not control, and in the
  // dark theme `bg-module-platform` is *brighter* than the page (#353638 vs
  // #151517), which costs a washed badge about 0.9 of ratio — 5.05 -> 4.14, i.e.
  // straight through the floor. So on that card the wash is pinned to bg-layer-1:
  // a badge's contrast becomes a property of the badge, not of whatever fill the
  // host picks underneath it. Declared after the six washes so it wins on equal
  // specificity; the neutral three above are (0,3,0) and keep their bg-base lift.
  '.redaiPluginCardArchived .redaiBadge{background:linear-gradient(color-mix(in srgb,currentColor 18%,transparent),color-mix(in srgb,currentColor 18%,transparent)),var(--dsw-alias-bg-layer-1)}',
  // Install command + copy control share one row so the button never wraps away
  // from the command it copies.
  '.redaiInstallRow{display:flex;align-items:flex-start;gap:8px;margin-top:6px}.redaiInstall{flex:1 1 auto;min-width:0;display:block;padding:8px 10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:17px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:6px;word-break:break-all}',
  '.redaiCopy{position:relative;flex:none;height:24px;padding:0 8px;font:inherit;font-size:11px;line-height:22px;color:var(--dsw-alias-label-secondary);background:transparent;border:.5px solid var(--dsw-alias-border-l1);border-radius:6px;cursor:pointer}.redaiCopy:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  // 24px -> 28px; the only neighbour is the read-only command block, so a
  // vertical-only box cannot steal anything.
  '.redaiCopy::after{content:"";position:absolute;left:0;right:0;top:50%;height:28px;transform:translateY(-50%);border-radius:6px}',
  // Plugin detail — the same rhythm as the list, so both pages read as one system.
  '.redaiMetrics{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:14px;padding:10px 0;border-top:.5px solid var(--dsw-alias-border-l1);border-bottom:.5px solid var(--dsw-alias-border-l1)}.redaiMetric{display:flex;flex-direction:column;gap:2px;min-width:0}',
  '.redaiMetricLabel{font-size:10px;line-height:14px;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}.redaiMetricValue{font-size:12px;line-height:18px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}',
  '.redaiStatusBar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:14px}.redaiStatusText{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
  '.redaiHighlight{position:relative;margin:0 0 6px;padding-left:22px;font-size:13px;line-height:21px;color:var(--dsw-alias-label-secondary)}.redaiHighlightNum{position:absolute;left:0;top:1px;display:grid;place-items:center;width:16px;height:16px;font-size:10px;line-height:1;color:var(--dsw-alias-label-tertiary);border:.5px solid var(--dsw-alias-border-l1);border-radius:50%;font-variant-numeric:tabular-nums}',
  '.redaiCaveatTitle{color:var(--dsw-alias-state-warn-label,#d33)}.redaiCaveat{position:relative;margin:0 0 6px;padding-left:14px;font-size:12px;line-height:19px;color:var(--dsw-alias-label-secondary)}',
  '.redaiCaveat::before{content:"";position:absolute;left:3px;top:8px;width:4px;height:4px;border-radius:50%;background:var(--dsw-alias-state-warn-label,#d33)}.redaiActionsHint{flex:1 1 100%;margin:0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',
]

/** 2429 -> "2.4k", 17 -> "17". */
function formatStars(count) {
  const n = Number(count) || 0
  if (n >= 1000) {
    const value = n / 1000
    return (n >= 10000 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, '')) + 'k'
  }
  return String(n)
}

/** A repository without a commit for this long reads as abandoned. Mirrors scripts/fetch-plugins.mjs. */
const STALE_AFTER_DAYS = 180

/**
 * Ranked categories as they appear in data/plugins.json, mapped to dictionary
 * keys so the English locale can name them without touching the data.
 */
const CATEGORY_KEYS = {
  '代码': 'code',
  '记忆': 'memory',
  '搜索': 'search',
  '界面': 'ui',
  '协作': 'collab',
  '运维': 'ops',
  '上下文': 'context',
}

/** Localized category label; unknown categories fall through verbatim. */
function categoryLabel(t, category) {
  const key = CATEGORY_KEYS[String(category || '')]
  return key ? t('plugin.category.' + key) : String(category || '')
}

/**
 * Maintained state: archived wins, a 180-day quiet stretch is stale,
 * everything else is active. Recomputed at render time so a stale snapshot
 * still reads correctly between data refreshes.
 */
function maintainedOf(plugin, now) {
  if (plugin.archived === true) return 'archived'
  if (plugin.maintained === 'archived') return 'archived'
  if (plugin.maintained === 'stale') return 'stale'
  const age = daysSince(plugin.pushed, now)
  return Number.isFinite(age) && age > STALE_AFTER_DAYS ? 'stale' : 'active'
}

/**
 * Sorts the ranking: archived entries sink to the bottom, everything else
 * keeps the curated order. Ranks are renumbered over the sorted list, so the
 * list never shows a gap where an archived entry used to sit.
 */
function orderPlugins(plugins, now) {
  const rows = plugins.map((plugin, index) => ({
    plugin,
    index,
    maintained: maintainedOf(plugin, now),
  }))
  rows.sort((a, b) => {
    const archivedA = a.maintained === 'archived' ? 1 : 0
    const archivedB = b.maintained === 'archived' ? 1 : 0
    if (archivedA !== archivedB) return archivedA - archivedB
    return a.index - b.index
  })
  return rows.map((row, position) => ({
    ...row.plugin,
    maintained: row.maintained,
    rank: position + 1,
  }))
}

/** Search haystack: name, blurb, rationale, category, highlights and tags. */
function pluginHaystack(plugin) {
  return [
    plugin.title,
    plugin.desc,
    plugin.why,
    plugin.category,
    ...(Array.isArray(plugin.highlights) ? plugin.highlights : []),
    ...(Array.isArray(plugin.tags) ? plugin.tags : []),
  ].join(' ').toLowerCase()
}

/** A metric without a value reads as "unknown" rather than a fake zero. */
function countText(value, t) {
  return Number.isFinite(value) ? formatStars(value) : t('plugin.unknown')
}

/** Host-surface states the ranking may carry. */
const HOST_STATES = ['none', 'yes', 'unknown']

/** Filter bar order: the default "all" chip, then the three host surfaces. */
const FILTER_KEYS = ['all', 'none', 'unknown', 'yes']

/**
 * Host-surface badge state. A missing or unrecognised value falls back to
 * `unknown`, so the UI never prints a raw dictionary key such as
 * `plugin.host.undefined`.
 */
function hostOf(plugin) {
  return HOST_STATES.indexOf(plugin.host) > -1 ? plugin.host : 'unknown'
}

/**
 * One card of the ranking grid.
 * Row 1: rank + name + stars. Row 2: blurb (2 lines max).
 * Row 3: maintained · host surface · last commit. Row 4: category.
 */
function PluginCard({ plugin, t, onOpen }) {
  const maintained = plugin.maintained || 'active'
  const host = hostOf(plugin)
  const category = categoryLabel(t, plugin.category)
  // A missing star count must not read as "0 ★".
  const starsText = countText(plugin.stars, t) + (Number.isFinite(plugin.stars) ? ' ★' : '')
  return jsxs('button', {
    type: 'button',
    className: 'redaiPluginCard' + (maintained === 'archived' ? ' redaiPluginCardArchived' : ''),
    title: plugin.desc,
    onClick: () => onOpen(plugin),
    children: [
      jsxs('div', {
        key: 'top',
        className: 'redaiPluginCardTop',
        children: [
          jsx('span', { key: 'rank', className: 'redaiRank', children: String(plugin.rank ?? '–') }),
          jsx('span', { key: 'name', className: 'redaiPluginName', children: plugin.title }),
          jsx('span', { key: 'stars', className: 'redaiStars', children: starsText }),
        ],
      }),
      jsx('div', { key: 'desc', className: 'redaiPluginDesc', children: plugin.desc }),
      jsxs('div', {
        key: 'meta',
        className: 'redaiPluginMeta',
        children: [
          jsx('span', {
            key: 'maintained',
            className: 'redaiBadge ' + maintained,
            title: t('plugin.maintainedHint.' + maintained),
            children: t('plugin.maintained.' + maintained),
          }),
          jsx('span', {
            key: 'host',
            className: 'redaiBadge ' + host,
            children: t('plugin.host.' + host),
          }),
          // No commit date means no date badge at all, never "updated undefined".
          ...(plugin.pushed
            ? [jsx('span', { key: 'pushed', children: fill(t('plugin.pushed'), { date: plugin.pushed }) })]
            : []),
        ],
      }),
      category
        ? jsx('div', {
          key: 'cat',
          className: 'redaiPluginCat',
          children: jsx('span', { key: 'badge', className: 'redaiBadge cat', children: category }),
        })
        : null,
    ],
  })
}

/**
 * Detail page for one ranked plugin. Block order is deliberate: identity,
 * numbers, freshness, then reading material, then the actions.
 *
 * The copy state is owned by NavPage and passed in: the offline harness calls
 * this component as a plain function, so it must not call hooks itself.
 */
function PluginDetail({ plugin, t, onOpen, onBack, copied, onCopy }) {
  const maintained = plugin.maintained || maintainedOf(plugin, Date.now())
  const host = hostOf(plugin)
  const install = 'dsh plugin --profile desktop add ' + plugin.pkg
  const highlights = Array.isArray(plugin.highlights) ? plugin.highlights : []
  const caveats = Array.isArray(plugin.caveats) ? plugin.caveats : []
  const category = categoryLabel(t, plugin.category)
  const release = plugin.release && plugin.release.tag ? plugin.release : null
  const releaseText = release
    ? release.tag + (release.at ? ' · ' + release.at : '')
    : t('plugin.noRelease')

  const metrics = [
    { key: 'stars', label: t('plugin.metrics.stars'), value: countText(plugin.stars, t) },
    { key: 'forks', label: t('plugin.metrics.forks'), value: countText(plugin.forks, t) },
    { key: 'issues', label: t('plugin.metrics.issues'), value: countText(plugin.issues, t) },
    { key: 'language', label: t('plugin.metrics.language'), value: plugin.language || t('plugin.unknown') },
    { key: 'license', label: t('plugin.metrics.license'), value: plugin.license || t('plugin.noLicense') },
    { key: 'created', label: t('plugin.metrics.created'), value: plugin.created || t('plugin.unknown') },
  ]

  const sections = []
  sections.push(detailSection('why', t('plugin.why'), [
    jsx('p', { key: 'p', className: 'redaiP', children: plugin.why }),
  ]))
  if (highlights.length > 0) {
    sections.push(detailSection('highlights', t('plugin.highlights'), highlights.map((text, index) => jsxs('p', {
      key: 'highlight:' + index,
      className: 'redaiHighlight',
      children: [
        jsx('span', { key: 'n', className: 'redaiHighlightNum', children: String(index + 1) }),
        text,
      ],
    }))))
  }
  if (caveats.length > 0) {
    sections.push(detailSection('caveats', t('plugin.caveats'), caveats.map((text, index) => jsx('p', {
      key: 'caveat:' + index,
      className: 'redaiCaveat',
      children: text,
    })), 'redaiCaveatTitle'))
  }
  sections.push(detailSection('install', t('plugin.install'), [jsxs('div', {
    key: 'row',
    className: 'redaiInstallRow',
    children: [
      // Plain text on purpose: the command must stay selectable and copy-safe.
      jsx('code', { key: 'c', className: 'redaiInstall', children: install }),
      jsx('button', {
        key: 'copy',
        type: 'button',
        className: 'redaiCopy',
        onClick: () => {
          if (onCopy) onCopy(install)
        },
        children: copied ? t('plugin.copied') : t('plugin.copy'),
      }),
    ],
  })]))

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
            style: tileStyle(plugin.title),
            children: plugin.title.slice(0, 1).toUpperCase(),
          }),
          jsxs('div', {
            key: 'head',
            className: 'redaiDetailHead',
            children: [
              jsx('div', { key: 't', className: 'redaiDetailTitle', children: plugin.title }),
              jsx('div', { key: 'g', className: 'redaiDetailTagline', children: plugin.desc }),
              jsxs('div', {
                key: 'tags',
                className: 'redaiDetailTags',
                children: [
                  category
                    ? jsx('span', { key: 'cat', className: 'redaiBadge cat', children: category })
                    : null,
                  jsx('span', {
                    key: 'host',
                    className: 'redaiBadge ' + host,
                    children: t('plugin.host.' + host),
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      jsx('div', {
        key: 'metrics',
        className: 'redaiMetrics',
        children: metrics.map((row) => jsxs('div', {
          key: row.key,
          className: 'redaiMetric',
          children: [
            jsx('span', { key: 'l', className: 'redaiMetricLabel', children: row.label }),
            jsx('span', { key: 'v', className: 'redaiMetricValue', children: row.value }),
          ],
        })),
      }),
      jsxs('div', {
        key: 'status',
        className: 'redaiStatusBar',
        children: [
          jsx('span', {
            key: 'badge',
            className: 'redaiBadge ' + maintained,
            title: t('plugin.maintainedHint.' + maintained),
            children: t('plugin.maintained.' + maintained),
          }),
          // No commit date means the strip keeps its badge and release only.
          ...(plugin.pushed
            ? [jsx('span', {
              key: 'pushed',
              className: 'redaiStatusText',
              children: fill(t('plugin.pushed'), { date: plugin.pushed }),
            })]
            : []),
          jsx('span', {
            key: 'release',
            className: 'redaiStatusText',
            children: t('plugin.metrics.release') + ' · ' + releaseText,
          }),
        ],
      }),
      ...sections,
      jsxs('div', {
        key: 'bar',
        className: 'redaiDetailBar',
        children: [
          jsx('button', {
            key: 'repo',
            type: 'button',
            className: 'redaiPrimary',
            onClick: () => onOpen(plugin.repo),
            children: t('plugin.repo'),
          }),
          plugin.homepage
            ? jsx('button', {
              key: 'homepage',
              type: 'button',
              className: 'redaiGhost',
              onClick: () => onOpen(plugin.homepage),
              children: t('plugin.homepage'),
            })
            : null,
          jsx('p', {
            key: 'hint',
            className: 'redaiActionsHint',
            children: t('plugin.hostHint.' + host),
          }),
        ],
      }),
    ],
  })
}
