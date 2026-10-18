export function SchemaBanner({ message }: { message: string }) {
  return (
    <p className="bg-white border border-line text-navy rounded-2xl px-4 py-3 text-sm leading-relaxed">{message}</p>
  );
}
