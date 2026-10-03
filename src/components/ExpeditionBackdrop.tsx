type ExpeditionBackdropProps = {
  src: string;
  position?: string;
};

/** Shared photographic backdrop for non-map Expedition screens. */
export default function ExpeditionBackdrop({
  src,
  position = "center",
}: ExpeditionBackdropProps) {
  return (
    <div className="pointer-events-none fixed inset-0" aria-hidden>
      <img
        src={src}
        alt=""
        width={1024}
        height={1536}
        className="h-full w-full object-cover"
        style={{ objectPosition: position }}
      />
      <div className="absolute inset-0 bg-background/55" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,var(--background)_0%,transparent_28%,var(--background)_100%)] opacity-80" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,transparent_0%,var(--background)_90%)] opacity-55" />
      <div className="ticks absolute inset-x-0 bottom-0 h-20 opacity-10" />
    </div>
  );
}