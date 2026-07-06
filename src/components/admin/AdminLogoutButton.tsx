'use client';

export function AdminLogoutButton({ className = '' }: { className?: string }) {
  async function handleLogout() {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    window.location.href = '/admin/registrations';
  }

  return (
    <button
      type="button"
      onClick={() => void handleLogout()}
      className={`px-4 py-2 rounded-full border border-line text-sm font-semibold text-navy hover:bg-soft ${className}`}
    >
      Log out
    </button>
  );
}
