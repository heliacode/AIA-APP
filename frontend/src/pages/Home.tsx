import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileCsv } from '@fortawesome/free-solid-svg-icons';
import { locationsApi } from '@/services/api';
import type { Location } from '@/services/api';
import { SUGGESTED_LOCATIONS } from '@/constants/suggestions';
import { getLocationIcon } from '@/constants/location-icons';
import LocationCard from '@/components/LocationCard';
import AddItemCard from '@/components/AddItemCard';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

export default function Home() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const addedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadLocations();
  }, []);

  useEffect(() => {
    if (!lastAddedId) return;
    const t = setTimeout(() => setLastAddedId(null), 2500);
    return () => clearTimeout(t);
  }, [lastAddedId]);

  useEffect(() => {
    if (lastAddedId && addedRef.current) {
      addedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [lastAddedId, locations]);

  const loadLocations = async () => {
    try {
      setLoading(true);
      const list = await locationsApi.list();
      setLocations(list);
    } catch {
      setLocations([]);
    } finally {
      setLoading(false);
    }
  };

  const addLocation = async (name: string) => {
    if (!name) return;
    try {
      setAdding(true);
      const loc = await locationsApi.create({ name });
      setLastAddedId(loc.id);
      toast.success('Lieu ajoute.');
      await loadLocations();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la creation';
      toast.error(message);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = (id: string) => {
    setConfirmDeleteId(id);
  };

  const executeDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await locationsApi.delete(confirmDeleteId);
      loadLocations();
    } catch {
      toast.error('Erreur lors de la suppression');
      throw new Error();
    }
  };

  const handleExportCsv = async () => {
    try {
      setExporting(true);
      const blob = await locationsApi.exportInventoryCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventaire-assurance-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Erreur lors de l\'export. Reessayez.');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center">
          <Spinner className="size-8" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Mes lieux</h1>
        {locations.length > 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={handleExportCsv}
            disabled={exporting}
            title="Exporter l'inventaire en CSV pour votre assureur"
          >
            {exporting ? (
              <Spinner className="mr-2 size-4" data-icon="inline-start" />
            ) : (
              <FontAwesomeIcon icon={faFileCsv} className="mr-2" />
            )}
            Exporter en CSV (assureur)
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {locations.map((location) => (
          <div
            key={location.id}
            ref={location.id === lastAddedId ? addedRef : undefined}
            className={lastAddedId === location.id ? 'rounded-lg ring-2 ring-green-500 ring-offset-2 transition-all' : ''}
          >
            <LocationCard location={location} onDelete={handleDelete} />
          </div>
        ))}
        <AddItemCard
          label="Ajouter un lieu"
          suggestions={SUGGESTED_LOCATIONS}
          getIcon={getLocationIcon}
          adding={adding}
          onAddFromSuggestion={addLocation}
          onAddCustom={addLocation}
          open={showAdd}
          onOpenChange={setShowAdd}
        />
      </div>

      {locations.length === 0 && !showAdd && (
        <p className="mt-2 text-sm text-muted-foreground">
          Aucun lieu pour le moment. Cliquez sur le "+" pour en ajouter.
        </p>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}
        title="Supprimer le lieu"
        description="Etes-vous sur de vouloir supprimer ce lieu ? Toutes les pieces, coffres et photos seront supprimes."
        confirmLabel="Supprimer"
        onConfirm={executeDelete}
      />
    </div>
  );
}
