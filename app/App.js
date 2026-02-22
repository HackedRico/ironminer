'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

    // ─── COLORS ────────────────────────────────────────────────────────────────
    const C = {
      bg:       '#0f172a',
      surface:  '#1e293b',
      surface2: '#273449',
      border:   '#334155',
      text:     '#f1f5f9',
      muted:    '#64748b',
      orange:   '#f97316',
      green:    '#22c55e',
      yellow:   '#facc15',
      red:      '#ef4444',
      blue:     '#60a5fa',
    };

    // ─── PROMPTS ───────────────────────────────────────────────────────────────
    const PROMPTS = {
      baseline:
        'Describe what is happening in this construction site image.',

      zoneDecomposition:
        'Divide this construction site image into spatial zones (foreground/midground/background, left/center/right, ground level/elevated). ' +
        'For each zone describe: what trade or activity is present, how many workers, what equipment and materials occupy the space, ' +
        'and how crowded the zone is on a 1–5 scale (1=empty, 5=severely congested). ' +
        'Use clear zone headers. Be specific about locations.',

      entityRelationship:
        'Based on this construction site image and the zone analysis above, describe the spatial relationships: ' +
        'which trades are working adjacent to each other, where are movement corridors blocked or narrow, ' +
        'where is equipment creating clearance issues, and which zones have multiple trades competing for the same space. ' +
        'Be specific about locations and consequences.',

      temporal: (prev, label) =>
        `Previous site analysis (${label}):\n${prev}\n\n` +
        'Now compare against the current frame. What has changed spatially? Have congestion hotspots shifted? ' +
        'Have new trade overlaps appeared? Has any area cleared? ' +
        'Rate the overall congestion trend: improving, stable, or worsening. Be specific about what changed and where.',

      briefing:
        'Summarize the spatial analysis as a briefing for a non-technical construction site manager. ' +
        'Plain language only — no jargon. Lead with the single most important issue. ' +
        'Keep it under 150 words. End with one specific, actionable recommendation a manager can act on right now.',
    };

    // ─── CLAUDE API ────────────────────────────────────────────────────────────
    async function callClaude(apiKey, messages, maxTokens = 1024) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens, messages }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `API error ${res.status}`);
      }
      const data = await res.json();
      return data.content[0].text;
    }

    function imgMsg(base64, prompt) {
      let mediaType = 'image/jpeg';
      let data = base64;
      if (base64.startsWith('data:')) {
        const m = base64.match(/^data:([^;]+);base64,(.+)$/);
        if (m) { mediaType = m[1]; data = m[2]; }
      }
      return {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
          { type: 'text', text: prompt },
        ],
      };
    }

    async function runTechniqueChain(apiKey, frame, previousAnalysis = null) {
      // Step 1 — zone decomposition
      const zoneAnalysis = await callClaude(apiKey, [imgMsg(frame.imageData, PROMPTS.zoneDecomposition)], 1024);

      // Step 2 — entity-relationship (multi-turn, building on zones)
      const relationships = await callClaude(apiKey, [
        imgMsg(frame.imageData, PROMPTS.zoneDecomposition),
        { role: 'assistant', content: zoneAnalysis },
        { role: 'user', content: PROMPTS.entityRelationship },
      ], 1024);

      // Step 3 — temporal comparison (if prior context available)
      let temporal = null;
      if (previousAnalysis) {
        temporal = await callClaude(apiKey, [
          imgMsg(frame.imageData, PROMPTS.temporal(previousAnalysis, 'previous frame')),
        ], 768);
      }

      // Step 4 — manager briefing (text-only synthesis)
      const ctx = [
        `Zone Analysis:\n${zoneAnalysis}`,
        `Spatial Relationships:\n${relationships}`,
        temporal ? `Temporal Changes:\n${temporal}` : '',
      ].filter(Boolean).join('\n\n---\n\n');

      const briefing = await callClaude(apiKey, [
        { role: 'user', content: `${ctx}\n\n---\n\n${PROMPTS.briefing}` },
      ], 512);

      return { zoneAnalysis, relationships, temporal, briefing, ts: new Date().toISOString() };
    }

    // ─── FRAME EXTRACTION ─────────────────────────────────────────────────────
    async function extractVideoFrames(file, interval = 5, onProgress) {
      return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const frames = [];

        video.onloadedmetadata = () => {
          canvas.width = Math.min(video.videoWidth, 960);
          canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
          const times = [];
          for (let t = 0; t < video.duration; t += interval) times.push(t);
          let i = 0;
          const next = () => {
            if (i >= times.length) { URL.revokeObjectURL(video.src); resolve(frames); return; }
            video.currentTime = times[i];
          };
          video.onseeked = () => {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            frames.push({
              id: `v${Date.now()}_${i}`,
              siteId: slugSite(file.name),
              timestamp: times[i],
              imageData: canvas.toDataURL('image/jpeg', 0.82),
              filename: `${file.name} @${Math.round(times[i])}s`,
            });
            onProgress?.(i + 1, times.length);
            i++;
            next();
          };
          next();
        };
        video.onerror = reject;
        video.src = URL.createObjectURL(file);
      });
    }

    async function readImageFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
          const m = file.name.match(/(\d{10,13})/);
          resolve({
            id: `i${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            siteId: slugSite(file.name),
            timestamp: m ? parseInt(m[1]) : Date.now(),
            imageData: e.target.result,
            filename: file.name,
          });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    function slugSite(name) {
      const patterns = [/^(site[-_]\w+)/i, /^([A-Z]\d{3,})/i, /^(\w+?)[-_.]/];
      for (const p of patterns) {
        const m = name.match(p);
        if (m) return m[1].toUpperCase().slice(0, 12);
      }
      return name.replace(/\.[^.]+$/, '').slice(0, 8).toUpperCase() || 'SITE-01';
    }

    function alertLevel(briefingText) {
      if (!briefingText) return 'none';
      const t = briefingText.toLowerCase();
      if (t.includes('critical') || t.includes('danger') || t.includes('immediate') || t.includes('unsafe')) return 'critical';
      if (t.includes('congest') || t.includes('block') || t.includes('overlap') || t.includes('crowd') || t.includes('risk')) return 'warning';
      return 'ok';
    }

    // ─── ROOT APP ──────────────────────────────────────────────────────────────
    function App() {
      const [apiKey, setApiKey]         = useState('');
      const [mode, setMode]             = useState('review');
      const [frames, setFrames]         = useState([]);
      const [analyses, setAnalyses]     = useState({});  // frameId → {zoneAnalysis, relationships, temporal, briefing, ts}
      const [siteBriefs, setSiteBriefs] = useState({});  // siteId → {text, ts}
      const [chains, setChains]         = useState({});  // siteId → [{frame, analysis}]
      const [experiments, setExperiments] = useState([]); // [{id, type, frameId, thumb, prompt, response, ts}]
      const [selectedSite, setSelectedSite] = useState(null);
      const [loading, setLoading]       = useState({});
      const [ingesting, setIngesting]   = useState(false);
      const [ingestProg, setIngestProg] = useState(null);
      const [liveAlerts, setLiveAlerts] = useState({});  // feedId → alert[]
      const [chatLogs, setChatLogs]     = useState({});  // feedId → msg[]
      const [error, setError]           = useState(null);

      const sites = useMemo(() => {
        const g = {};
        frames.forEach(f => {
          if (!g[f.siteId]) g[f.siteId] = [];
          g[f.siteId].push(f);
        });
        Object.keys(g).forEach(id => g[id].sort((a, b) => a.timestamp - b.timestamp));
        return g;
      }, [frames]);

      const busy = key => setLoading(p => ({ ...p, [key]: true }));
      const done = key => setLoading(p => { const n = { ...p }; delete n[key]; return n; });

      // ── Ingest ──────────────────────────────────────────────────────────────
      const handleIngest = async files => {
        setIngesting(true);
        const added = [];
        for (const f of Array.from(files)) {
          const ext = f.name.split('.').pop().toLowerCase();
          if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext)) {
            setIngestProg({ file: f.name, cur: 0, tot: '?' });
            const vframes = await extractVideoFrames(f, 5, (cur, tot) =>
              setIngestProg({ file: f.name, cur, tot })
            );
            added.push(...vframes);
          } else if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
            added.push(await readImageFile(f));
            setIngestProg({ file: f.name, cur: 1, tot: 1 });
          }
        }
        setFrames(p => [...p, ...added]);
        setIngesting(false);
        setIngestProg(null);
      };

      // ── Baseline ─────────────────────────────────────────────────────────────
      const runBaseline = async frame => {
        const key = `bl_${frame.id}`;
        busy(key);
        try {
          const response = await callClaude(apiKey, [imgMsg(frame.imageData, PROMPTS.baseline)]);
          setExperiments(p => [...p, {
            id: Date.now(), type: 'baseline', frameId: frame.id,
            thumb: frame.imageData, filename: frame.filename,
            prompt: PROMPTS.baseline, response, ts: new Date().toISOString(),
          }]);
          return response;
        } catch (e) { setError(e.message); }
        finally { done(key); }
      };

      // ── Technique (single frame) ──────────────────────────────────────────────
      const runTechnique = async (frame, prevAnalysis = null) => {
        const key = `tc_${frame.id}`;
        busy(key);
        try {
          const analysis = await runTechniqueChain(apiKey, frame, prevAnalysis);
          setAnalyses(p => ({ ...p, [frame.id]: analysis }));
          setExperiments(p => [...p, {
            id: Date.now(), type: 'technique', frameId: frame.id,
            thumb: frame.imageData, filename: frame.filename,
            prompt: 'Zone + Relationship + Briefing chain', response: analysis.briefing,
            fullAnalysis: analysis, ts: analysis.ts,
          }]);
          return analysis;
        } catch (e) { setError(e.message); }
        finally { done(key); }
      };

      // ── Site chain (all frames) ───────────────────────────────────────────────
      const runSiteChain = async siteId => {
        const siteFrames = (sites[siteId] || []).slice(0, 6);
        if (!siteFrames.length) return;
        busy(`chain_${siteId}`);
        try {
          const results = [];
          let prev = null;
          for (const f of siteFrames) {
            const a = await runTechniqueChain(apiKey, f, prev);
            setAnalyses(p => ({ ...p, [f.id]: a }));
            results.push({ frame: f, analysis: a });
            prev = `${a.zoneAnalysis}\n\n${a.relationships}`;
          }
          // Site-level briefing
          const combined = results.map((r, i) => `Time ${i + 1}:\n${r.analysis.briefing}`).join('\n\n---\n\n');
          const siteBrief = await callClaude(apiKey, [{
            role: 'user',
            content: `Across ${results.length} time periods on this construction site:\n\n${combined}\n\n${PROMPTS.briefing}`,
          }], 512);
          setSiteBriefs(p => ({ ...p, [siteId]: { text: siteBrief, ts: new Date().toISOString() } }));
          setChains(p => ({ ...p, [siteId]: results }));
        } finally { done(`chain_${siteId}`); }
      };

      const siteAlertLevel = siteId => alertLevel(siteBriefs[siteId]?.text);

      return (
        <div style={S.app}>
          <NavBar apiKey={apiKey} onKey={setApiKey} mode={mode} onMode={setMode} />

          {mode === 'review' && (
            <ReviewMode
              sites={sites} analyses={analyses} siteBriefs={siteBriefs} chains={chains}
              loading={loading} ingesting={ingesting} ingestProg={ingestProg}
              selectedSite={selectedSite} onSelectSite={setSelectedSite}
              onIngest={handleIngest} onRunBaseline={runBaseline}
              onRunTechnique={runTechnique} onRunChain={runSiteChain}
              siteAlertLevel={siteAlertLevel} apiKey={apiKey}
            />
          )}

          {mode === 'live' && (
            <LiveMode
              sites={sites} liveAlerts={liveAlerts} chatLogs={chatLogs}
              loading={loading} apiKey={apiKey}
              onAlert={(id, a) => setLiveAlerts(p => ({ ...p, [id]: [...(p[id] || []), a] }))}
              onChat={(id, m) => setChatLogs(p => ({ ...p, [id]: [...(p[id] || []), m] }))}
            />
          )}

          {mode === 'experiments' && (
            <ExperimentsMode experiments={experiments} loading={loading} />
          )}
        </div>
      );
    }

    // ─── NAV BAR ───────────────────────────────────────────────────────────────
    function NavBar({ apiKey, onKey, mode, onMode }) {
      const [show, setShow] = useState(false);
      return (
        <div style={S.nav}>
          <div style={S.navBrand}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ marginRight: 8 }}>
              <polygon points="12,2 22,8 22,16 12,22 2,16 2,8" stroke={C.orange} strokeWidth="2" fill="none"/>
              <polygon points="12,7 17,10 17,14 12,17 7,14 7,10" fill={C.orange} opacity="0.6"/>
            </svg>
            <span style={S.navTitle}>IronSite Manager</span>
          </div>

          <div style={S.navTabs}>
            {[['review','Review'],['live','Live'],['experiments','Experiments']].map(([k,label]) => (
              <button key={k} style={{ ...S.navTab, ...(mode === k ? S.navTabOn : {}) }} onClick={() => onMode(k)}>
                {label}
              </button>
            ))}
          </div>

          <div style={S.navKey}>
            <div style={S.keyWrap}>
              <input
                type={show ? 'text' : 'password'}
                placeholder="sk-ant-... API key"
                value={apiKey}
                onChange={e => onKey(e.target.value)}
                style={S.keyInput}
              />
              <button style={S.keyEye} onClick={() => setShow(s => !s)}>{show ? '🙈' : '👁'}</button>
            </div>
            {apiKey && <span style={{ color: C.green, fontSize: 18 }}>●</span>}
          </div>
        </div>
      );
    }

    // ─── REVIEW MODE ───────────────────────────────────────────────────────────
    function ReviewMode({ sites, analyses, siteBriefs, chains, loading, ingesting, ingestProg, selectedSite, onSelectSite, onIngest, onRunBaseline, onRunTechnique, onRunChain, siteAlertLevel, apiKey }) {
      const siteIds = useMemo(() => Object.keys(sites).sort((a, b) => {
        const rank = { critical: 3, warning: 2, ok: 1, none: 0 };
        return rank[siteAlertLevel(b)] - rank[siteAlertLevel(a)];
      }), [sites, siteBriefs]);

      if (selectedSite) return (
        <SiteDetail
          siteId={selectedSite}
          frames={sites[selectedSite] || []}
          analyses={analyses}
          briefing={siteBriefs[selectedSite]}
          chain={chains[selectedSite]}
          loading={loading}
          onBack={() => onSelectSite(null)}
          onRunBaseline={onRunBaseline}
          onRunTechnique={onRunTechnique}
          onRunChain={() => onRunChain(selectedSite)}
          apiKey={apiKey}
        />
      );

      return (
        <div style={S.reviewWrap}>
          <DropZone onIngest={onIngest} ingesting={ingesting} prog={ingestProg} />

          {siteIds.length === 0 && !ingesting && (
            <Empty icon="🏗" title="No sites loaded" sub="Drop footage above — videos or image sequences accepted" />
          )}

          {siteIds.length > 0 && (
            <div style={S.siteGrid}>
              {siteIds.map(id => (
                <SiteCard
                  key={id} siteId={id}
                  frames={sites[id]}
                  briefing={siteBriefs[id]}
                  level={siteAlertLevel(id)}
                  busy={!!loading[`chain_${id}`]}
                  onOpen={() => onSelectSite(id)}
                  onAnalyze={() => onRunChain(id)}
                  hasKey={!!apiKey}
                />
              ))}
            </div>
          )}
        </div>
      );
    }

    // ─── DROP ZONE ─────────────────────────────────────────────────────────────
    function DropZone({ onIngest, ingesting, prog }) {
      const ref = useRef();
      const [drag, setDrag] = useState(false);
      return (
        <div
          style={{ ...S.dropzone, ...(drag ? S.dropzoneDrag : {}) }}
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); onIngest(e.dataTransfer.files); }}
          onClick={() => !ingesting && ref.current.click()}
        >
          <input ref={ref} type="file" multiple accept="video/*,image/*" style={{ display: 'none' }}
            onChange={e => onIngest(e.target.files)} />
          {ingesting ? (
            <div style={S.ingestState}>
              <Spinner />
              {prog && <div style={S.ingestText}>Extracting {prog.file} — frame {prog.cur} of {prog.tot}</div>}
            </div>
          ) : (
            <>
              <div style={S.dropIcon}>↑</div>
              <div style={S.dropTitle}>Drop footage here</div>
              <div style={S.dropSub}>MP4 · MOV · WEBM · JPG · PNG — click to browse</div>
            </>
          )}
        </div>
      );
    }

    // ─── SITE CARD ─────────────────────────────────────────────────────────────
    function SiteCard({ siteId, frames, briefing, level, busy, onOpen, onAnalyze, hasKey }) {
      const colors = { critical: C.red, warning: C.orange, ok: C.green, none: C.border };
      const labels = { critical: '⚠ CRITICAL', warning: '! CONGESTION', ok: '✓ CLEAR', none: '' };
      const thumb = frames[0]?.imageData;
      return (
        <div style={{ ...S.siteCard, borderColor: colors[level] }} onClick={onOpen}>
          {thumb ? (
            <div style={S.cardThumbWrap}>
              <img src={thumb} style={S.cardThumb} alt={siteId} />
              {level !== 'none' && (
                <div style={{ ...S.cardBadge, background: colors[level] }}>{labels[level]}</div>
              )}
              <div style={S.cardFrameCount}>{frames.length} frames</div>
            </div>
          ) : (
            <div style={S.cardNoThumb}>No frames</div>
          )}
          <div style={S.cardBody}>
            <div style={S.cardTitle}>{siteId}</div>
            {briefing ? (
              <div style={S.cardBriefPreview}>{briefing.text.slice(0, 110)}…</div>
            ) : (
              <div style={{ ...S.cardBriefPreview, color: C.muted, fontStyle: 'italic' }}>Not yet analyzed</div>
            )}
            <div style={S.cardActions} onClick={e => e.stopPropagation()}>
              <Btn onClick={onOpen}>View →</Btn>
              {hasKey && !briefing && (
                <Btn secondary onClick={onAnalyze} disabled={busy}>{busy ? 'Analyzing…' : 'Analyze Site'}</Btn>
              )}
            </div>
          </div>
        </div>
      );
    }

    // ─── SITE DETAIL ───────────────────────────────────────────────────────────
    function SiteDetail({ siteId, frames, analyses, briefing, chain, loading, onBack, onRunBaseline, onRunTechnique, onRunChain, apiKey }) {
      const [tab, setTab] = useState('briefing');
      const [selFrame, setSelFrame] = useState(frames[0] || null);
      const chainBusy = !!loading[`chain_${siteId}`];

      return (
        <div style={S.detail}>
          <div style={S.detailHeader}>
            <button style={S.backBtn} onClick={onBack}>← Back</button>
            <div style={S.detailTitle}>{siteId}</div>
            <div style={S.detailMeta}>{frames.length} frames</div>
            <div style={{ flex: 1 }} />
            {apiKey && (
              <Btn onClick={onRunChain} disabled={chainBusy}>
                {chainBusy ? 'Analyzing…' : '▶ Run Full Analysis'}
              </Btn>
            )}
          </div>

          <div style={S.tabs}>
            {[['briefing','Manager Briefing'],['frames','Frame Analysis'],['timeline','Timeline']].map(([k,l]) => (
              <button key={k} style={{ ...S.tab, ...(tab === k ? S.tabOn : {}) }} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>

          <div style={S.detailBody}>
            {tab === 'briefing' && <BriefingTab briefing={briefing} busy={chainBusy} />}
            {tab === 'frames' && (
              <FramesTab
                frames={frames} analyses={analyses} selFrame={selFrame} onSel={setSelFrame}
                loading={loading} onBaseline={onRunBaseline} onTechnique={onRunTechnique} apiKey={apiKey}
              />
            )}
            {tab === 'timeline' && <TimelineTab chain={chain} busy={chainBusy} />}
          </div>
        </div>
      );
    }

    // ─── BRIEFING TAB ──────────────────────────────────────────────────────────
    function BriefingTab({ briefing, busy }) {
      if (busy) return <Loader text="Running spatial analysis chain…" />;
      if (!briefing) return <Empty icon="📋" title="No briefing yet" sub="Click 'Run Full Analysis' to generate a site briefing" />;
      const level = alertLevel(briefing.text);
      const levelColor = { critical: C.red, warning: C.orange, ok: C.green, none: C.blue }[level];
      return (
        <div style={S.briefingWrap}>
          <div style={{ ...S.briefingCard, borderColor: levelColor }}>
            <div style={S.briefingTop}>
              <div style={{ ...S.briefingBadge, color: levelColor }}>SITE BRIEFING</div>
              <div style={S.briefingTs}>{new Date(briefing.ts).toLocaleString()}</div>
            </div>
            <div style={S.briefingText}>{briefing.text}</div>
          </div>
        </div>
      );
    }

    // ─── FRAMES TAB ────────────────────────────────────────────────────────────
    function FramesTab({ frames, analyses, selFrame, onSel, loading, onBaseline, onTechnique, apiKey }) {
      const a = selFrame ? analyses[selFrame.id] : null;
      const blBusy = selFrame && !!loading[`bl_${selFrame.id}`];
      const tcBusy = selFrame && !!loading[`tc_${selFrame.id}`];
      return (
        <div style={S.framesLayout}>
          {/* Frame list */}
          <div style={S.frameList}>
            {frames.map(f => (
              <div key={f.id} style={{ ...S.frameItem, ...(selFrame?.id === f.id ? S.frameItemOn : {}) }} onClick={() => onSel(f)}>
                <img src={f.imageData} style={S.frameItemThumb} alt={f.filename} />
                <div style={S.frameItemName}>{f.filename?.slice(0, 22)}</div>
                {analyses[f.id] && <div style={S.frameItemDone}>✓</div>}
              </div>
            ))}
          </div>

          {/* Frame main */}
          <div style={S.frameMain}>
            {!selFrame && <Empty icon="🖼" title="Select a frame" sub="Choose from the list on the left" />}
            {selFrame && (
              <>
                <img src={selFrame.imageData} style={S.frameImg} alt="frame" />
                {apiKey && (
                  <div style={S.frameActions}>
                    <Btn secondary onClick={() => onBaseline(selFrame)} disabled={blBusy}>
                      {blBusy ? 'Running…' : 'Run Baseline'}
                    </Btn>
                    <Btn onClick={() => onTechnique(selFrame)} disabled={tcBusy}>
                      {tcBusy ? 'Analyzing…' : '▶ Run Technique'}
                    </Btn>
                  </div>
                )}
                {(blBusy || tcBusy) && <Loader text={tcBusy ? 'Running 4-step spatial chain…' : 'Running baseline prompt…'} />}
                {a && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <Section title="Zone Analysis" content={a.zoneAnalysis} />
                    <Section title="Spatial Relationships" content={a.relationships} />
                    {a.temporal && <Section title="Temporal Changes" content={a.temporal} accent={C.yellow} />}
                    <Section title="Manager Briefing" content={a.briefing} accent={C.orange} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      );
    }

    // ─── TIMELINE TAB ──────────────────────────────────────────────────────────
    function TimelineTab({ chain, busy }) {
      if (busy) return <Loader text="Running temporal chain…" />;
      if (!chain?.length) return <Empty icon="🕐" title="No timeline yet" sub="Run Full Analysis to see how the site evolved over time" />;
      return (
        <div style={S.timeline}>
          {chain.map(({ frame, analysis }, i) => (
            <div key={frame.id} style={S.tlItem}>
              <div style={S.tlStep}>
                <div style={S.tlNum}>{i + 1}</div>
                {i < chain.length - 1 && <div style={S.tlLine} />}
              </div>
              <div style={S.tlContent}>
                <img src={frame.imageData} style={S.tlThumb} alt="" />
                <div style={S.tlText}>
                  <div style={S.tlFile}>{frame.filename}</div>
                  <div style={S.tlBrief}>{analysis.briefing}</div>
                  {analysis.temporal && (
                    <div style={S.tlDelta}>
                      <span style={{ color: C.yellow, fontWeight: 600 }}>Δ Changes: </span>
                      {analysis.temporal.slice(0, 220)}…
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    // ─── LIVE MODE ─────────────────────────────────────────────────────────────
    function LiveMode({ sites, liveAlerts, chatLogs, loading, apiKey, onAlert, onChat }) {
      const [selFeed, setSelFeed] = useState(null);
      const feeds = useMemo(() => Object.keys(sites).map((sid, i) => ({
        id: `feed_${sid}`, name: `Camera ${i + 1}`, siteId: sid,
        frame: sites[sid][sites[sid].length - 1],
      })), [sites]);

      if (!feeds.length) return (
        <Empty icon="📹" title="No feeds available" sub="Upload footage in Review mode first — sites will appear here as simulated live cameras" />
      );

      return (
        <div style={S.liveLayout}>
          <div style={S.feedGrid}>
            {feeds.map(f => (
              <FeedCard
                key={f.id} feed={f}
                alerts={liveAlerts[f.id] || []}
                selected={selFeed?.id === f.id}
                onSelect={() => setSelFeed(f)}
                apiKey={apiKey}
                onAlert={a => onAlert(f.id, a)}
              />
            ))}
          </div>
          {selFeed && (
            <CommsPanel
              feed={selFeed}
              log={chatLogs[selFeed.id] || []}
              onSend={msg => onChat(selFeed.id, { from: 'Manager', text: msg, time: new Date().toLocaleTimeString() })}
              onClose={() => setSelFeed(null)}
            />
          )}
        </div>
      );
    }

    // ─── FEED CARD ─────────────────────────────────────────────────────────────
    function FeedCard({ feed, alerts, selected, onSelect, apiKey, onAlert }) {
      const [scanning, setScanning] = useState(false);
      const [autoScan, setAutoScan] = useState(false);
      const latest = alerts[alerts.length - 1];

      const scan = useCallback(async () => {
        if (!apiKey || scanning || !feed.frame) return;
        setScanning(true);
        try {
          const r = await callClaude(apiKey, [
            imgMsg(feed.frame.imageData, PROMPTS.zoneDecomposition + '\n\n' + PROMPTS.briefing),
          ], 512);
          onAlert({ text: r, time: new Date().toLocaleTimeString() });
        } catch (e) { console.error(e); }
        finally { setScanning(false); }
      }, [apiKey, scanning, feed]);

      useEffect(() => {
        if (!autoScan) return;
        const t = setInterval(scan, 30000);
        return () => clearInterval(t);
      }, [autoScan, scan]);

      return (
        <div style={{ ...S.feedCard, ...(selected ? S.feedCardOn : {}) }} onClick={onSelect}>
          <div style={S.feedHead}>
            <span style={S.feedLabel}>{feed.name} — {feed.siteId}</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {alerts.length > 0 && <span style={S.alertDot}>{alerts.length}</span>}
              {scanning && <span style={S.liveBadge}>SCANNING</span>}
            </div>
          </div>

          {feed.frame ? (
            <img src={feed.frame.imageData} style={S.feedImg} alt={feed.siteId} />
          ) : (
            <div style={S.feedNoImg}>No image</div>
          )}

          {latest && (
            <div style={S.feedAlert}>
              <span style={S.feedAlertTime}>{latest.time}</span>
              <span style={S.feedAlertText}>{latest.text.slice(0, 90)}…</span>
            </div>
          )}

          {apiKey && (
            <div style={S.feedActions} onClick={e => e.stopPropagation()}>
              <button style={S.scanBtn} onClick={scan} disabled={scanning || !feed.frame}>
                {scanning ? 'Scanning…' : 'Scan Now'}
              </button>
              <button
                style={{ ...S.scanBtn, color: autoScan ? C.green : C.muted }}
                onClick={() => setAutoScan(a => !a)}
              >
                {autoScan ? '⏸ Auto' : '▶ Auto (30s)'}
              </button>
            </div>
          )}
        </div>
      );
    }

    // ─── COMMS PANEL ───────────────────────────────────────────────────────────
    function CommsPanel({ feed, log, onSend, onClose }) {
      const [msg, setMsg] = useState('');
      const ref = useRef();
      useEffect(() => { ref.current && (ref.current.scrollTop = ref.current.scrollHeight); }, [log]);
      const send = () => { if (msg.trim()) { onSend(msg.trim()); setMsg(''); } };
      return (
        <div style={S.comms}>
          <div style={S.commsHead}>
            <span>Comms — {feed.name}</span>
            <button style={S.closeBtn} onClick={onClose}>✕</button>
          </div>
          <div style={S.commsStatus}><span style={S.dot} />Worker available</div>
          <div ref={ref} style={S.chatLog}>
            {log.length === 0 && <div style={S.chatEmpty}>No messages. Type below to reach the worker.</div>}
            {log.map((m, i) => (
              <div key={i} style={S.chatMsg}>
                <div style={S.chatMeta}><span style={S.chatFrom}>{m.from}</span><span style={S.chatTime}>{m.time}</span></div>
                <div style={S.chatText}>{m.text}</div>
              </div>
            ))}
          </div>
          <div style={S.chatFooter}>
            <input style={S.chatInput} value={msg} onChange={e => setMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()} placeholder="Message worker…" />
            <Btn onClick={send}>Send</Btn>
          </div>
        </div>
      );
    }

    // ─── EXPERIMENTS MODE ──────────────────────────────────────────────────────
    function ExperimentsMode({ experiments }) {
      const baselines  = experiments.filter(e => e.type === 'baseline');
      const techniques = experiments.filter(e => e.type === 'technique');
      const byFrame    = {};
      experiments.forEach(e => {
        if (!byFrame[e.frameId]) byFrame[e.frameId] = {};
        byFrame[e.frameId][e.type] = e;
      });
      const pairs = Object.values(byFrame).filter(p => p.baseline || p.technique);

      return (
        <div style={S.expWrap}>
          <div style={S.expHeader}>
            <div style={S.sectionTitle}>Experiment Log</div>
            <div style={S.expStats}>{baselines.length} baseline · {techniques.length} technique runs</div>
          </div>

          {experiments.length === 0 && (
            <Empty icon="🔬" title="No experiments yet"
              sub="Open a site → select a frame → click 'Run Baseline' or 'Run Technique' to populate this log" />
          )}

          {pairs.length > 0 && (
            <div style={S.expTable}>
              <div style={S.expTableHead}>
                <div>Frame</div>
                <div>Baseline — naive prompt</div>
                <div>Technique — spatial chain</div>
              </div>
              {pairs.map((p, i) => {
                const e = p.baseline || p.technique;
                return (
                  <div key={i} style={S.expRow}>
                    <div style={S.expRowThumbCol}>
                      <img src={e.thumb} style={S.expThumb} alt="" />
                      <div style={S.expFilename}>{e.filename}</div>
                    </div>
                    <div style={{ ...S.expRowCell, color: C.muted }}>
                      {p.baseline ? p.baseline.response : <i>Not run</i>}
                    </div>
                    <div style={S.expRowCell}>
                      {p.technique ? p.technique.response : <i style={{ color: C.muted }}>Not run</i>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {techniques.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <div style={S.expSubTitle}>Full Technique Analyses</div>
              {techniques.map((e, i) => (
                <div key={i} style={S.expCard}>
                  <img src={e.thumb} style={S.expCardThumb} alt="" />
                  <div style={{ flex: 1 }}>
                    <div style={S.expCardMeta}>{e.filename} · {new Date(e.ts).toLocaleString()}</div>
                    {e.fullAnalysis && (
                      <>
                        <Section title="Zone Analysis" content={e.fullAnalysis.zoneAnalysis} />
                        <div style={{ marginTop: 8 }}>
                          <Section title="Manager Briefing" content={e.fullAnalysis.briefing} accent={C.orange} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // ─── SHARED UI COMPONENTS ──────────────────────────────────────────────────
    function Section({ title, content, accent }) {
      return (
        <div style={{ ...S.section, ...(accent ? { borderColor: accent, background: `${accent}0d` } : {}) }}>
          <div style={{ ...S.sectionLabel, ...(accent ? { color: accent } : {}) }}>{title}</div>
          <div style={S.sectionContent}>{content}</div>
        </div>
      );
    }

    function Btn({ children, onClick, disabled, secondary }) {
      return (
        <button style={{ ...(secondary ? S.btnSec : S.btnPri) }} onClick={onClick} disabled={disabled}>
          {children}
        </button>
      );
    }

    function Spinner() {
      return <div style={S.spinner} />;
    }

    function Loader({ text }) {
      return (
        <div style={S.loader}>
          <Spinner />
          <div style={{ color: C.muted, fontSize: 14 }}>{text}</div>
        </div>
      );
    }

    function Empty({ icon, title, sub }) {
      return (
        <div style={S.empty}>
          {icon && <div style={S.emptyIcon}>{icon}</div>}
          {title && <div style={S.emptyTitle}>{title}</div>}
          {sub && <div style={S.emptySub}>{sub}</div>}
        </div>
      );
    }

    // ─── STYLES ────────────────────────────────────────────────────────────────
    const S = {
      app: { minHeight: '100vh', background: C.bg, color: C.text, display: 'flex', flexDirection: 'column' },

      // Nav
      nav: { display: 'flex', alignItems: 'center', gap: 20, padding: '12px 24px', background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 },
      navBrand: { display: 'flex', alignItems: 'center' },
      navTitle: { fontSize: 17, fontWeight: 700, letterSpacing: '-0.4px' },
      navTabs: { display: 'flex', gap: 4, flex: 1, justifyContent: 'center' },
      navTab: { padding: '7px 18px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, cursor: 'pointer', fontSize: 14, fontWeight: 500 },
      navTabOn: { background: C.orange, borderColor: C.orange, color: '#fff' },
      navKey: { display: 'flex', alignItems: 'center', gap: 8 },
      keyWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
      keyInput: { padding: '8px 36px 8px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, width: 230, outline: 'none' },
      keyEye: { position: 'absolute', right: 8, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 15 },

      // Review
      reviewWrap: { flex: 1, padding: 24, display: 'flex', flexDirection: 'column', gap: 24, overflowY: 'auto' },

      // Drop zone
      dropzone: { border: `2px dashed ${C.border}`, borderRadius: 12, padding: '28px 24px', textAlign: 'center', cursor: 'pointer', background: C.surface, transition: 'all 0.15s' },
      dropzoneDrag: { borderColor: C.orange, background: `${C.orange}12` },
      ingestState: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
      ingestText: { fontSize: 14, color: C.muted },
      dropIcon: { fontSize: 28, color: C.orange, marginBottom: 8 },
      dropTitle: { fontSize: 17, fontWeight: 600, marginBottom: 6 },
      dropSub: { fontSize: 13, color: C.muted },

      // Site grid
      siteGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 },
      siteCard: { background: C.surface, borderRadius: 12, border: `2px solid ${C.border}`, overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.1s', animation: 'fadein 0.2s ease' },
      cardThumbWrap: { position: 'relative', aspectRatio: '16/9', overflow: 'hidden' },
      cardThumb: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
      cardBadge: { position: 'absolute', top: 8, right: 8, padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, color: '#fff' },
      cardFrameCount: { position: 'absolute', bottom: 6, left: 8, fontSize: 11, color: 'rgba(255,255,255,0.7)', background: 'rgba(0,0,0,0.5)', padding: '2px 7px', borderRadius: 4 },
      cardNoThumb: { aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.surface2, color: C.muted, fontSize: 13 },
      cardBody: { padding: 16 },
      cardTitle: { fontSize: 17, fontWeight: 700, marginBottom: 6 },
      cardBriefPreview: { fontSize: 13, color: C.muted, lineHeight: 1.55, marginBottom: 14, minHeight: 40 },
      cardActions: { display: 'flex', gap: 8 },

      // Site detail
      detail: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'fadein 0.2s ease' },
      detailHeader: { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 24px', background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 },
      backBtn: { padding: '7px 14px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, cursor: 'pointer', fontSize: 13 },
      detailTitle: { fontSize: 20, fontWeight: 700 },
      detailMeta: { fontSize: 13, color: C.muted },
      tabs: { display: 'flex', background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 },
      tab: { padding: '11px 20px', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', color: C.muted, cursor: 'pointer', fontSize: 14, fontWeight: 500 },
      tabOn: { color: C.orange, borderBottomColor: C.orange },
      detailBody: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },

      // Briefing
      briefingWrap: { flex: 1, overflowY: 'auto', padding: 32, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' },
      briefingCard: { background: C.surface, borderRadius: 16, border: `2px solid ${C.border}`, padding: 32, maxWidth: 660, width: '100%' },
      briefingTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
      briefingBadge: { fontSize: 11, fontWeight: 700, letterSpacing: 2 },
      briefingTs: { fontSize: 12, color: C.muted },
      briefingText: { fontSize: 18, lineHeight: 1.75 },

      // Frames tab
      framesLayout: { flex: 1, display: 'grid', gridTemplateColumns: '196px 1fr', overflow: 'hidden' },
      frameList: { borderRight: `1px solid ${C.border}`, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 },
      frameItem: { borderRadius: 8, overflow: 'hidden', cursor: 'pointer', border: '2px solid transparent', position: 'relative' },
      frameItemOn: { borderColor: C.orange },
      frameItemThumb: { width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' },
      frameItemName: { fontSize: 10, color: C.muted, padding: '3px 6px', background: C.surface2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      frameItemDone: { position: 'absolute', top: 4, right: 4, background: C.green, color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 },
      frameMain: { padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 },
      frameImg: { width: '100%', borderRadius: 10, display: 'block' },
      frameActions: { display: 'flex', gap: 10 },

      // Section
      section: { background: C.surface, borderRadius: 10, padding: '14px 16px', border: `1px solid ${C.border}` },
      sectionLabel: { fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, textTransform: 'uppercase', marginBottom: 8 },
      sectionContent: { fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap' },

      // Timeline
      timeline: { flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column' },
      tlItem: { display: 'flex', gap: 16 },
      tlStep: { display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 },
      tlNum: { width: 30, height: 30, background: C.orange, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 },
      tlLine: { width: 2, flex: 1, background: C.border, margin: '6px 0', minHeight: 32 },
      tlContent: { display: 'flex', gap: 14, paddingBottom: 28, flex: 1 },
      tlThumb: { width: 112, height: 63, objectFit: 'cover', borderRadius: 8, flexShrink: 0 },
      tlText: { flex: 1 },
      tlFile: { fontSize: 11, color: C.muted, marginBottom: 6 },
      tlBrief: { fontSize: 14, lineHeight: 1.6, marginBottom: 8 },
      tlDelta: { fontSize: 13, color: C.muted, lineHeight: 1.5 },

      // Live
      liveLayout: { flex: 1, display: 'grid', gridTemplateColumns: '1fr 340px', overflow: 'hidden' },
      feedGrid: { padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, overflowY: 'auto', alignContent: 'start' },
      feedCard: { background: C.surface, borderRadius: 12, border: `2px solid ${C.border}`, overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.15s' },
      feedCardOn: { borderColor: C.orange },
      feedHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: C.surface2 },
      feedLabel: { fontSize: 13, fontWeight: 600 },
      alertDot: { background: C.red, color: '#fff', borderRadius: '50%', minWidth: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, padding: '0 4px' },
      liveBadge: { fontSize: 10, fontWeight: 700, color: C.yellow, letterSpacing: 1, animation: 'pulse 1s infinite' },
      feedImg: { width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' },
      feedNoImg: { aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.surface2, color: C.muted, fontSize: 13 },
      feedAlert: { padding: '7px 12px', background: `${C.red}18`, borderTop: `1px solid ${C.red}40` },
      feedAlertTime: { fontSize: 10, color: C.muted, marginRight: 6 },
      feedAlertText: { fontSize: 12 },
      feedActions: { display: 'flex', borderTop: `1px solid ${C.border}` },
      scanBtn: { flex: 1, padding: '8px 4px', background: 'transparent', border: 'none', borderRight: `1px solid ${C.border}`, color: C.orange, cursor: 'pointer', fontSize: 12, fontWeight: 600 },

      // Comms
      comms: { background: C.surface, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
      commsHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${C.border}`, fontWeight: 700, fontSize: 15 },
      closeBtn: { background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 18 },
      commsStatus: { padding: '8px 18px', borderBottom: `1px solid ${C.border}`, fontSize: 13, color: C.green, display: 'flex', alignItems: 'center', gap: 8 },
      dot: { width: 8, height: 8, borderRadius: '50%', background: C.green, display: 'inline-block' },
      chatLog: { flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 },
      chatEmpty: { fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 24 },
      chatMsg: { display: 'flex', flexDirection: 'column', gap: 3 },
      chatMeta: { display: 'flex', alignItems: 'center', gap: 8 },
      chatFrom: { fontSize: 11, fontWeight: 700, color: C.orange },
      chatTime: { fontSize: 11, color: C.muted },
      chatText: { fontSize: 14, lineHeight: 1.5 },
      chatFooter: { padding: 14, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8 },
      chatInput: { flex: 1, padding: '9px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 14, outline: 'none' },

      // Experiments
      expWrap: { flex: 1, padding: 28, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 28 },
      expHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
      sectionTitle: { fontSize: 22, fontWeight: 700 },
      expStats: { fontSize: 14, color: C.muted },
      expTable: { borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` },
      expTableHead: { display: 'grid', gridTemplateColumns: '150px 1fr 1fr', gap: 16, padding: '10px 16px', background: C.surface2, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: C.muted },
      expRow: { display: 'grid', gridTemplateColumns: '150px 1fr 1fr', gap: 16, padding: '14px 16px', borderTop: `1px solid ${C.border}`, background: C.surface, fontSize: 13, lineHeight: 1.6 },
      expRowThumbCol: {},
      expThumb: { width: '100%', borderRadius: 6, marginBottom: 6 },
      expFilename: { fontSize: 11, color: C.muted },
      expRowCell: {},
      expSubTitle: { fontSize: 15, fontWeight: 600, color: C.muted, marginBottom: 12 },
      expCard: { display: 'flex', gap: 16, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 12 },
      expCardThumb: { width: 110, height: 62, objectFit: 'cover', borderRadius: 8, flexShrink: 0 },
      expCardMeta: { fontSize: 12, color: C.muted, marginBottom: 10 },

      // Shared
      btnPri: { padding: '8px 18px', background: C.orange, border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' },
      btnSec: { padding: '8px 18px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, cursor: 'pointer', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' },
      spinner: { width: 28, height: 28, border: `3px solid ${C.border}`, borderTop: `3px solid ${C.orange}`, borderRadius: '50%', animation: 'spin 0.7s linear infinite' },
      loader: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 48 },
      empty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '60px 40px', textAlign: 'center' },
      emptyIcon: { fontSize: 48, marginBottom: 4 },
      emptyTitle: { fontSize: 20, fontWeight: 700 },
      emptySub: { fontSize: 14, color: C.muted, maxWidth: 380, lineHeight: 1.6 },
    };
export default App;
