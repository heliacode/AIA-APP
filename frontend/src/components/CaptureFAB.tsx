import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCamera, faDoorOpen, faVault, faPlus } from '@fortawesome/free-solid-svg-icons';
import { locationsApi } from '@/services/api';
import type { Location } from '@/services/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const HIDDEN_PATHS = ['/login', '/admin', '/location/new', '/new', '/privacy', '/terms', '/support', '/cookies'];

export default function CaptureFAB() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);

  const hidden = HIDDEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    locationsApi
      .list()
      .then((list) => setLocations(list))
      .catch(() => setLocations([]))
      .finally(() => setLoading(false));
  }, [open]);

  if (hidden) return null;

  const pickContainer = (type: 'room' | 'safe', id: string) => {
    setOpen(false);
    navigate(`/${type}/${id}?autoCapture=1`);
  };

  const hasAny = locations.some(
    (l) => (l.rooms?.length ?? 0) > 0 || (l.safes?.length ?? 0) > 0
  );

  return (
    <>
      <Button
        type="button"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Prendre une photo"
        className="fixed bottom-6 right-6 z-40 size-14 rounded-full shadow-lg md:bottom-8 md:right-8"
      >
        <FontAwesomeIcon icon={faCamera} className="text-xl" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Prendre une photo</DialogTitle>
            <DialogDescription>
              Choisissez la piece ou le coffre ou ranger la photo.
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          )}

          {!loading && !hasAny && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Aucune piece ni coffre. Creez d'abord un lieu.
              </p>
              <Button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate('/location/new');
                }}
              >
                <FontAwesomeIcon icon={faPlus} className="mr-2" />
                Nouveau lieu
              </Button>
            </div>
          )}

          {!loading && hasAny && (
            <div className="flex flex-col gap-4">
              {locations.map((loc) => {
                const rooms = loc.rooms ?? [];
                const safes = loc.safes ?? [];
                if (rooms.length === 0 && safes.length === 0) return null;
                return (
                  <div key={loc.id}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {loc.name}
                    </p>
                    <div className="flex flex-col gap-1">
                      {rooms.map((r) => (
                        <Button
                          key={r.id}
                          type="button"
                          variant="ghost"
                          className="justify-start"
                          onClick={() => pickContainer('room', r.id)}
                        >
                          <FontAwesomeIcon icon={faDoorOpen} className="mr-2 text-primary" />
                          {r.name}
                        </Button>
                      ))}
                      {safes.map((s) => (
                        <Button
                          key={s.id}
                          type="button"
                          variant="ghost"
                          className="justify-start"
                          onClick={() => pickContainer('safe', s.id)}
                        >
                          <FontAwesomeIcon icon={faVault} className="mr-2 text-secondary" />
                          {s.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
