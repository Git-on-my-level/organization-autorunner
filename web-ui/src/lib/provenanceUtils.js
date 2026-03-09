export function getProvenanceSources(provenance) {
  if (!Array.isArray(provenance?.sources)) {
    return [];
  }

  return provenance.sources.map((source) => String(source));
}

export function isUnknownProvenance(provenance) {
  return getProvenanceSources(provenance).length === 0;
}

export function hasInferredProvenance(provenance) {
  const sources = getProvenanceSources(provenance);
  return sources.some((source) => source.toLowerCase().includes("inferred"));
}

export function getProvenancePresentation(provenance) {
  if (isUnknownProvenance(provenance)) {
    return {
      unknown: true,
      inferred: false,
      title: "No provenance",
      toneClass: "border-slate-500/20 bg-slate-500/10 text-slate-400",
    };
  }

  const inferred = hasInferredProvenance(provenance);

  return {
    unknown: false,
    inferred,
    title: inferred ? "Inferred provenance" : "Evidence-backed provenance",
    toneClass: inferred
      ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
      : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  };
}
