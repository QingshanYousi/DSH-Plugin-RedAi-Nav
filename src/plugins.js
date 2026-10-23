/**
 * Plugin ranking: the category board, the per-category top ten, and the plugin
 * detail page.
 *
 * The data is schema v2 (see docs/spec/2026-10-23-ranking-v2-spec.md §2.2):
 * ranks are decided by `scripts/build-ranking.mjs` and stored in the file, so
 * nothing here re-sorts or renumbers — a rank the user sees is the rank the
 * build computed.
 *
 * Fragment rules (see scripts/build.mjs): no `import`/`export`; `jsx`/`jsxs` come
 * from the enclosing factory scope. `React` is never used here on purpose — both
 * components stay pure functions so the offline harness can call them directly.
 */

const cssPlugins = [
  // ── board chrome ──────────────────────────────────────────────────────────
  // Spacing rhythm: 8 / 10 / 14 / 18, the same as the site list.
  '.redaiRankBasis{padding:14px 24px 0;font-size:11px;line-height:16px;color:light-dark(#61666b,var(--dsw-alias-label-tertiary));font-variant-numeric:tabular-nums}.redaiCatBar{display:flex;flex-wrap:wrap;gap:6px;padding:8px 24px 0}',
  '.redaiFilterChip{position:relative;height:22px;padding:0 9px;font:inherit;font-size:11px;line-height:20px;color:var(--dsw-alias-label-secondary);background:transparent;border:.5px solid var(--dsw-alias-border-l1);border-radius:999px;cursor:pointer;transition:background var(--redai-fast) ease,color var(--redai-fast) ease;font-variant-numeric:tabular-nums}.redaiFilterChip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  // Same 28px pointer target as the recent chips, and the same reason for
  // growing only vertically: they share a 6px gap.
  '.redaiFilterChip::after{content:"";position:absolute;left:0;right:0;top:50%;height:28px;transform:translateY(-50%);border-radius:999px}',
  // A chip is a control, so it needs a focus ring of its own: the UA default is
  // a 1px auto outline that lands at 1.04:1 on the dark page, i.e. invisible.
  '.redaiFilterChip:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
  '.redaiFilterChip[aria-pressed="true"]{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)}',
  // "More" is the same chip with a dashed edge, so it reads as an action on the
  // row rather than as an eleventh category.
  '.redaiCatMore{border-style:dashed}',
  // ── one category section ─────────────────────────────────────────────────
  '.redaiRankSection{padding:18px 24px 0}.redaiRankSectionHead{display:flex;align-items:baseline;gap:8px;margin-bottom:8px}',
  '.redaiRankSectionTitle{font-size:13px;line-height:20px;font-weight:600}.redaiRankSectionCount{margin-left:auto;font-size:11px;line-height:16px;color:light-dark(#61666b,var(--dsw-alias-label-tertiary));font-variant-numeric:tabular-nums}',
  // ── rank 1: one standing card, brand colour, 76px ────────────────────────
  // Only the first place gets colour and an outline; places 2–10 stay grey.
  // Colouring all ten would make the whole board look like a warning.
  '.redaiRankTop{display:flex;align-items:center;gap:10px;width:100%;min-height:76px;padding:8px 12px;font:inherit;text-align:left;color:inherit;background:var(--dsw-alias-bg-layer-1);border:.5px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 34%,var(--dsw-alias-border-l1));border-radius:var(--dsw-radius-md,10px);cursor:pointer;transition:background .12s ease}',
  '.redaiRankTop:hover{background:var(--dsw-alias-interactive-bg-hover)}.redaiRankTop:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
  // Tabular figures: 01 and 10 must line up with the rows below them.
  '.redaiRankTopNum{flex:none;width:36px;font-size:22px;line-height:26px;font-weight:600;letter-spacing:-.02em;color:var(--dsw-alias-brand-primary);font-variant-numeric:tabular-nums}',
  '.redaiRankTopBody{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 auto}.redaiRankTopHead{display:flex;align-items:baseline;gap:6px;min-width:0}',
  '.redaiRankTopTitle{min-width:0;font-size:14px;line-height:20px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.redaiRankTopDesc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.redaiRankTopMeta{font-size:11px;line-height:16px;color:light-dark(#61666b,var(--dsw-alias-label-tertiary));font-variant-numeric:tabular-nums}',
  // ── ranks 2–10: 44px rows, one hairline between rows, none after the last ──
  '.redaiRankList{display:flex;flex-direction:column;margin-top:2px}',
  '.redaiRankRow{display:flex;align-items:center;gap:10px;width:100%;height:44px;padding:0 12px;font:inherit;text-align:left;color:inherit;background:transparent;border:0;border-top:.5px solid var(--dsw-alias-border-l1);cursor:pointer;transition:background .12s ease}',
  '.redaiRankRow:first-child{border-top:0}.redaiRankRow:hover{background:var(--dsw-alias-interactive-bg-hover)}.redaiRankRow:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
  '.redaiRankRowNum{flex:none;width:26px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:18px;color:light-dark(#61666b,var(--dsw-alias-label-tertiary));font-variant-numeric:tabular-nums}',
  '.redaiRankRowTitle{flex:1 1 0;min-width:0;font-size:13px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.redaiRankRowMeta{flex:none;font-size:11px;line-height:16px;color:light-dark(#61666b,var(--dsw-alias-label-tertiary));font-variant-numeric:tabular-nums}.redaiRankRowDate{white-space:nowrap}',
  // In a 420px sidebar the date would squeeze the name down to one character.
  // Freshness is still on the detail page and in the ordering itself, so at that
  // width the date goes and the name keeps its room.
  '@media (max-width:460px){.redaiRankRowDate{display:none}.redaiRankTopHead .redaiBadge{display:none}}',
  // The row that cannot be ranked on freshness still says why it is here.
  '.redaiRankRowNote{flex:none;font-size:11px;line-height:16px;color:light-dark(#61666b,var(--dsw-alias-label-tertiary))}',
  // ── section footer ───────────────────────────────────────────────────────
  '.redaiRankFoot{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:7px 12px 0;font-size:11px;line-height:16px}',
  '.redaiRankMore{position:relative;flex:none;height:22px;padding:0 9px;font:inherit;font-size:11px;line-height:20px;color:var(--dsw-alias-label-secondary);background:transparent;border:.5px solid var(--dsw-alias-border-l1);border-radius:999px;cursor:pointer}',
  // 22px chip, 28px target, vertical only: it shares a 10px gap with the count.
  '.redaiRankMore::after{content:"";position:absolute;left:0;right:0;top:50%;height:28px;transform:translateY(-50%);border-radius:999px}',
  '.redaiRankMore:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.redaiRankMore:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
  // ── badges ───────────────────────────────────────────────────────────────
  '.redaiBadge{flex:none;display:inline-flex;align-items:center;padding:0 5px;font-size:11px;line-height:15px;font-weight:500;border-radius:4px}',
  // Declared (carries a DSH topic) vs undeclared. Same green/neutral pair as the
  // site cards, so one colour keeps meaning one thing across both tabs. Ratios
  // against the host's real hover token: 6.13 / 5.55 / 6.65 / 5.34 — above the
  // 4.9 bar, not merely 4.5.
  '.redaiBadge.tagged{color:light-dark(#125736,#8de0b8);background:color-mix(in srgb,currentColor 18%,transparent)}',
  // Two neutral pills: an outline plus a fill a step off the page, so the label
  // keeps full contrast in both themes.
  '.redaiBadge.untagged{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l1)}.redaiBadge.cat{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l1)}',
  '.redaiBadge.archived{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l1)}',
  // ── install row: command and copy control share one line ──────────────────
  '.redaiInstallRow{display:flex;align-items:flex-start;gap:8px;margin-top:6px}.redaiInstall{flex:1 1 auto;min-width:0;display:block;padding:8px 10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:17px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l1);border-radius:6px;word-break:break-all}',
  '.redaiCopy{position:relative;flex:none;height:24px;padding:0 8px;font:inherit;font-size:11px;line-height:22px;color:var(--dsw-alias-label-secondary);background:transparent;border:.5px solid var(--dsw-alias-border-l1);border-radius:6px;cursor:pointer}.redaiCopy:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  // 24px -> 28px; the only neighbour is the read-only command block, so a
  // vertical-only box cannot steal anything.
  '.redaiCopy::after{content:"";position:absolute;left:0;right:0;top:50%;height:28px;transform:translateY(-50%);border-radius:6px}',
  // ── plugin detail ────────────────────────────────────────────────────────
  '.redaiMetrics{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:14px;padding:10px 0;border-top:.5px solid var(--dsw-alias-border-l1);border-bottom:.5px solid var(--dsw-alias-border-l1)}.redaiMetric{display:flex;flex-direction:column;gap:2px;min-width:0}',
  '.redaiMetricLabel{font-size:10px;line-height:14px;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}.redaiMetricValue{font-size:12px;line-height:18px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}',
  '.redaiActionsHint{flex:1 1 100%;margin:0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',
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

/** `2026-10-21` -> `10-21`; unusable input -> ''. Ranks print short dates. */
function shortDate(value) {
  const text = String(value || '')
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text.slice(5) : ''
}

/** 1 -> "01", 10 -> "10". Two digits keep the column aligned. */
function rankLabel(rank) {
  const n = Number(rank)
  if (!Number.isFinite(n) || n < 1) return '—'
  return n < 10 ? '0' + n : String(n)
}

/** Localized category name; the data's own label is the fallback. */
function categoryName(t, category, english) {
  if (!category) return ''
  const key = 'plugin.category.' + category.id
  const label = typeof t === 'function' ? t(key) : undefined
  if (typeof label === 'string' && label.length > 0 && label !== key) return label
  return english ? category.nameEn || category.name : category.name
}

/** Categories the board renders right now: the nine formal ones, or all eleven. */
function categoriesShown(ranking, expanded) {
  const list = Array.isArray(ranking && ranking.categories) ? ranking.categories : []
  return expanded ? list : list.filter((category) => category.hidden !== true)
}

/** Every item in the board, hidden categories included — the tab counter. */
function rankingCount(ranking) {
  const list = Array.isArray(ranking && ranking.categories) ? ranking.categories : []
  return list.reduce((count, category) => count + (Array.isArray(category.items) ? category.items.length : 0), 0)
}

/** Search haystack of one row: name, repo slug, blurb and topics. */
function pluginHaystack(item) {
  return [
    item.title,
    item.full,
    item.desc,
    ...(Array.isArray(item.topics) ? item.topics : []),
  ].join(' ').toLowerCase()
}

/**
 * Items of one category that survive the query. A query that names the category
 * keeps the whole section — that is the fastest way to "show me memory plugins".
 * Rows never renumber: the board is a ranking, and a filter is a lens.
 */
function itemsMatching(category, needle, english) {
  const items = Array.isArray(category.items) ? category.items : []
  // The query arrives already folded by the caller; folding again here keeps a
  // direct call (tests, preview harness) from silently matching nothing.
  const text = String(needle || '').trim().toLowerCase()
  if (!text) return items
  const name = (categoryName(null, category, english) + ' ' + category.name + ' ' + category.nameEn).toLowerCase()
  if (name.indexOf(text) > -1) return items
  return items.filter((item) => pluginHaystack(item).includes(text))
}

/** The one line above the board: how it was ordered and how fresh it is. */
function sortBasis(t, updatedAt) {
  return fill(t('plugin.sortBasis'), { date: updatedAt })
}

/**
 * Looks a row up by its `owner/name` identity, together with the category it
 * sits in — the detail page needs both, and the identity is stable across
 * refreshes in a way an array index or a synthetic id would not be.
 */
function findPlugin(ranking, full) {
  const categories = Array.isArray(ranking && ranking.categories) ? ranking.categories : []
  for (const category of categories) {
    const items = Array.isArray(category.items) ? category.items : []
    for (const item of items) {
      if (item.full === full) return { category, item }
    }
  }
  return null
}

/** Install command, in the form the shell's own docs use. */
function installCommand(item) {
  return 'dsh plugin --profile desktop add github:' + item.full
}

/** A metric without a value reads as "unknown" rather than a fake zero. */
function countText(value, t) {
  return Number.isFinite(value) ? formatStars(value) : t('plugin.unknown')
}

/**
 * Why this row is on the board, derived from its own data and nothing else —
 * rank, stars, last commit, archived. No editorial voice: the numbers already
 * say it, and inventing an opinion would be a lie the data cannot back.
 */
function whyHere(item, category, t, english) {
  const parts = []
  parts.push(fill(t('plugin.whyHereRank'), { rank: item.rank }))
  parts.push(fill(t('plugin.whyHereStars'), { n: formatStars(item.stars) }))
  const pushed = shortDate(item.pushed)
  if (pushed) parts.push(fill(t('plugin.whyHerePushed'), { date: pushed }))
  parts.push(item.archived ? t('plugin.whyHereArchived') : t('plugin.whyHereLive'))
  parts.push(item.tagged ? t('plugin.whyHereTagged') : t('plugin.whyHereUntagged'))
  return parts.join(' · ') + (english ? '.' : '。')
}

/** Badges carried by a row or a detail head: archived and topic state. */
function rankBadges(item, t) {
  const badges = []
  if (item.archived === true) {
    badges.push(jsx('span', {
      key: 'archived',
      className: 'redaiBadge archived',
      title: t('plugin.archivedHint'),
      children: t('plugin.archived'),
    }))
  }
  badges.push(jsx('span', {
    key: 'tagged',
    className: 'redaiBadge ' + (item.tagged ? 'tagged' : 'untagged'),
    title: item.tagged ? t('plugin.taggedHint') : t('plugin.untaggedHint'),
    children: item.tagged ? t('plugin.tagged') : t('plugin.untagged'),
  }))
  return badges
}

/**
 * Rank 1 of a category. One standing card, brand-coloured ordinal, one line of
 * description and a metric strip — deliberately taller than a row so the
 * hierarchy is legible before anything is read.
 */
function RankTop({ item, t, onSelect }) {
  // Same shape as a row's meta: stars, then the short date. "更新于" is a
  // sentence and belongs to the page-level ordering line, not to a rank; the
  // declared/undeclared state already has a badge next to the name.
  const meta = [formatStars(item.stars) + ' ★']
  const pushed = shortDate(item.pushed)
  if (pushed) meta.push(pushed)
  return jsxs('button', {
    type: 'button',
    className: 'redaiRankTop',
    title: item.desc,
    onClick: () => onSelect(item),
    children: [
      jsx('span', { key: 'num', className: 'redaiRankTopNum', children: rankLabel(item.rank) }),
      jsxs('span', {
        key: 'body',
        className: 'redaiRankTopBody',
        children: [
          jsxs('span', {
            key: 'head',
            className: 'redaiRankTopHead',
            children: [
              jsx('span', { key: 'title', className: 'redaiRankTopTitle', children: item.title }),
              ...rankBadges(item, t).map((badge) => jsx('span', { key: 'badge:' + badge.key, children: badge })),
            ],
          }),
          jsx('span', { key: 'desc', className: 'redaiRankTopDesc', children: item.desc }),
          jsx('span', { key: 'meta', className: 'redaiRankTopMeta', children: meta.join(' · ') }),
        ],
      }),
    ],
  })
}

/** Ranks 2–10: one 44px line each, ordinal, name, stars and date on the right. */
function RankRow({ item, t, onSelect }) {
  const pushed = shortDate(item.pushed)
  return jsxs('button', {
    type: 'button',
    className: 'redaiRankRow',
    title: item.desc,
    onClick: () => onSelect(item),
    children: [
      jsx('span', { key: 'num', className: 'redaiRankRowNum', children: rankLabel(item.rank) }),
      jsx('span', { key: 'title', className: 'redaiRankRowTitle', children: item.title }),
      item.archived === true
        ? jsx('span', { key: 'note', className: 'redaiRankRowNote', children: t('plugin.archived') })
        : null,
      // Stars and date are two spans so a narrow panel can drop the date
      // instead of squeezing the name down to a single character. The ` · `
      // lives inside the date span, so hiding it takes the separator with it.
      jsxs('span', {
        key: 'meta',
        className: 'redaiRankRowMeta',
        children: [
          jsx('span', { key: 'stars', className: 'redaiRankRowStars', children: formatStars(item.stars) + ' ★' }),
          pushed ? jsx('span', { key: 'date', className: 'redaiRankRowDate', children: ' · ' + pushed }) : null,
        ],
      }),
    ],
  })
}

/**
 * One category of the board: heading with the category's own size, the standing
 * card, the compact rows, then the door to the full list.
 */
function RankSection({ category, items, t, english, onSelect, onOpen, listUrl }) {
  const top = items.length > 0 ? items[0] : null
  const rest = items.slice(1)
  const total = Number.isFinite(category.total) ? category.total : items.length
  const name = categoryName(t, category, english)
  return jsxs('section', {
    className: 'redaiRankSection',
    children: [
      jsxs('div', {
        key: 'head',
        className: 'redaiRankSectionHead',
        children: [
          jsx('span', { key: 'name', className: 'redaiRankSectionTitle', children: name }),
          jsx('span', {
            key: 'count',
            className: 'redaiRankSectionCount',
            children: fill(t('plugin.boardCounts'), { n: items.length, total }),
          }),
        ],
      }),
      top ? jsx(RankTop, { key: 'top', item: top, t, onSelect }) : null,
      rest.length > 0
        ? jsx('div', {
          key: 'list',
          className: 'redaiRankList',
          children: rest.map((item) => jsx(RankRow, { key: item.full, item, t, onSelect })),
        })
        : null,
      jsx('div', {
        key: 'foot',
        className: 'redaiRankFoot',
        children: jsx('button', {
          key: 'more',
          type: 'button',
          className: 'redaiRankMore',
          title: listUrl + (category.anchor || ''),
          onClick: () => onOpen(listUrl + (category.anchor || '')),
          children: t('plugin.seeAll') + ' →',
        }),
      }),
    ],
  })
}

/**
 * Detail page for one ranked plugin.
 *
 * v2 carries no editorial fields (there is no `why`/`highlights`/`caveats`), so
 * the page does not leave three empty blocks behind: identity, the metric strip,
 * one data-derived sentence, the install command, the actions.
 *
 * The copy state is owned by NavPage and passed in: the offline harness calls
 * this component as a plain function, so it must not call hooks itself.
 */
function PluginDetail({ plugin, category, t, english, onOpen, onBack, copied, onCopy }) {
  const install = installCommand(plugin)
  const name = categoryName(t, category, english)
  const metrics = [
    { key: 'stars', label: t('plugin.metrics.stars'), value: countText(plugin.stars, t) },
    { key: 'forks', label: t('plugin.metrics.forks'), value: countText(plugin.forks, t) },
    { key: 'language', label: t('plugin.metrics.language'), value: plugin.language || t('plugin.unknown') },
    { key: 'license', label: t('plugin.metrics.license'), value: plugin.license || t('plugin.noLicense') },
    { key: 'created', label: t('plugin.metrics.created'), value: plugin.created || t('plugin.unknown') },
  ]

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
                  name ? jsx('span', { key: 'cat', className: 'redaiBadge cat', children: name }) : null,
                  ...rankBadges(plugin, t).map((badge) => jsx('span', { key: 'badge:' + badge.key, children: badge })),
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
      detailSection('why', t('plugin.whyHere'), [
        jsx('p', { key: 'p', className: 'redaiP', children: whyHere(plugin, category, t, english) }),
      ]),
      detailSection('install', t('plugin.install'), [jsxs('div', {
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
      })]),
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
            children: t('plugin.thirdPartyHint'),
          }),
        ],
      }),
    ],
  })
}
