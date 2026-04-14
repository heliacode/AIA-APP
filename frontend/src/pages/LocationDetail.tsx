import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faDoorOpen, faVault } from '@fortawesome/free-solid-svg-icons';
import { locationsApi, roomsApi, safesApi } from '@/services/api';
import type { Location } from '@/services/api';
import { SUGGESTED_ROOMS, SUGGESTED_SAFES } from '@/constants/suggestions';
import { getRoomIcon } from '@/constants/room-icons';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import ContainerCard from '@/components/ContainerCard';
import AddItemCard from '@/components/AddItemCard';
import PageBreadcrumb from '@/components/PageBreadcrumb';

export default function LocationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [location, setLocation] = useState<Location | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingRoom, setAddingRoom] = useState(false);
  const [addingSafe, setAddingSafe] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingRoomName, setEditingRoomName] = useState('');
  const [editingSafeId, setEditingSafeId] = useState<string | null>(null);
  const [editingSafeName, setEditingSafeName] = useState('');
  const [savingRoom, setSavingRoom] = useState(false);
  const [savingSafe, setSavingSafe] = useState(false);
  const [lastAddedRoomId, setLastAddedRoomId] = useState<string | null>(null);
  const [lastAddedSafeId, setLastAddedSafeId] = useState<string | null>(null);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showAddSafe, setShowAddSafe] = useState(false);
  const [confirmDeleteRoomId, setConfirmDeleteRoomId] = useState<string | null>(null);
  const [confirmDeleteSafeId, setConfirmDeleteSafeId] = useState<string | null>(null);
  const addedRoomRef = useRef<HTMLDivElement>(null);
  const addedSafeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) loadLocation();
  }, [id]);

  useEffect(() => {
    if (!lastAddedRoomId && !lastAddedSafeId) return;
    const t = setTimeout(() => {
      setLastAddedRoomId(null);
      setLastAddedSafeId(null);
    }, 2500);
    return () => clearTimeout(t);
  }, [lastAddedRoomId, lastAddedSafeId]);

  useEffect(() => {
    if (lastAddedRoomId && addedRoomRef.current) {
      addedRoomRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (lastAddedSafeId && addedSafeRef.current) {
      addedSafeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [lastAddedRoomId, lastAddedSafeId, location?.rooms, location?.safes]);

  const loadLocation = async (silent = false) => {
    if (!id) return;
    try {
      if (!silent) setLoading(true);
      const data = await locationsApi.getById(id);
      setLocation(data);
    } catch {
      if (!silent) setLocation(null);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const addRoom = async (name: string) => {
    if (!id || !name) return;
    try {
      setAddingRoom(true);
      const room = await locationsApi.addRoom(id, name);
      setLastAddedRoomId(room.id);
      toast.success('Piece ajoutee et enregistree.');
      setLocation((prev) =>
        prev
          ? { ...prev, rooms: [...(prev.rooms ?? []), { id: room.id, name, _count: { images: 0 } }] }
          : prev
      );
      await loadLocation(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement';
      toast.error(message);
    } finally {
      setAddingRoom(false);
    }
  };

  const addSafe = async (name: string) => {
    if (!id || !name) return;
    try {
      setAddingSafe(true);
      const safe = await locationsApi.addSafe(id, name);
      setLastAddedSafeId(safe.id);
      toast.success('Coffre ajoute et enregistre.');
      setLocation((prev) =>
        prev
          ? { ...prev, safes: [...(prev.safes ?? []), { id: safe.id, name, _count: { images: 0 } }] }
          : prev
      );
      await loadLocation(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement';
      toast.error(message);
    } finally {
      setAddingSafe(false);
    }
  };

  const handleDeleteRoom = (roomId: string) => {
    setConfirmDeleteRoomId(roomId);
  };

  const executeDeleteRoom = async () => {
    if (!confirmDeleteRoomId) return;
    try {
      await roomsApi.delete(confirmDeleteRoomId);
      loadLocation();
    } catch {
      toast.error('Erreur lors de la suppression');
      throw new Error();
    }
  };

  const handleDeleteSafe = (safeId: string) => {
    setConfirmDeleteSafeId(safeId);
  };

  const executeDeleteSafe = async () => {
    if (!confirmDeleteSafeId) return;
    try {
      await safesApi.delete(confirmDeleteSafeId);
      loadLocation();
    } catch {
      toast.error('Erreur lors de la suppression');
      throw new Error();
    }
  };

  const startEditRoom = (room: { id: string; name: string }) => {
    setEditingRoomId(room.id);
    setEditingRoomName(room.name);
  };
  const cancelEditRoom = () => {
    setEditingRoomId(null);
    setEditingRoomName('');
  };
  const handleSaveRoomName = async () => {
    if (!editingRoomId || !editingRoomName.trim()) return;
    try {
      setSavingRoom(true);
      await roomsApi.update(editingRoomId, editingRoomName.trim());
      cancelEditRoom();
      await loadLocation();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur';
      toast.error(message);
    } finally {
      setSavingRoom(false);
    }
  };

  const startEditSafe = (safe: { id: string; name: string }) => {
    setEditingSafeId(safe.id);
    setEditingSafeName(safe.name);
  };
  const cancelEditSafe = () => {
    setEditingSafeId(null);
    setEditingSafeName('');
  };
  const handleSaveSafeName = async () => {
    if (!editingSafeId || !editingSafeName.trim()) return;
    try {
      setSavingSafe(true);
      await safesApi.update(editingSafeId, editingSafeName.trim());
      cancelEditSafe();
      await loadLocation();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur';
      toast.error(message);
    } finally {
      setSavingSafe(false);
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

  if (!location) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertDescription>Lieu introuvable</AlertDescription>
        </Alert>
        <Button type="button" variant="ghost" className="mt-4" onClick={() => navigate('/')}>
          <FontAwesomeIcon icon={faArrowLeft} className="mr-2" />
          Retour
        </Button>
      </div>
    );
  }

  const rooms = location.rooms ?? [];
  const safes = location.safes ?? [];

  return (
    <div className="container mx-auto px-4 py-8">
      <PageBreadcrumb
        items={[
          { label: 'Accueil', to: '/' },
          { label: location.name },
        ]}
      />

      <Card className="mb-6 shadow-lg">
        <CardContent className="p-6">
          <h1 className="text-3xl font-bold">{location.name}</h1>
          {location.address && (
            <p className="text-muted-foreground">{location.address}</p>
          )}
        </CardContent>
      </Card>

      {/* Pieces */}
      <section className="mb-8">
        <h2 className="mb-4 flex items-center text-xl font-semibold">
          <FontAwesomeIcon icon={faDoorOpen} className="mr-2 text-primary" />
          Pieces
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {rooms.map((room) => (
            <ContainerCard
              key={room.id}
              containerType="room"
              container={room}
              highlighted={room.id === lastAddedRoomId}
              editing={editingRoomId === room.id}
              editName={editingRoomName}
              saving={savingRoom}
              onEditNameChange={setEditingRoomName}
              onStartEdit={() => startEditRoom(room)}
              onSaveEdit={handleSaveRoomName}
              onCancelEdit={cancelEditRoom}
              onDelete={() => handleDeleteRoom(room.id)}
              scrollRef={room.id === lastAddedRoomId ? addedRoomRef : undefined}
            />
          ))}
          <AddItemCard
            label="Ajouter une piece"
            suggestions={SUGGESTED_ROOMS}
            getIcon={getRoomIcon}
            adding={addingRoom}
            onAddFromSuggestion={addRoom}
            onAddCustom={addRoom}
            open={showAddRoom}
            onOpenChange={setShowAddRoom}
          />
        </div>
        {rooms.length === 0 && !showAddRoom && (
          <p className="mt-2 text-sm text-muted-foreground">
            Aucune piece. Cliquez sur le "+" pour en ajouter.
          </p>
        )}
      </section>

      {/* Coffres */}
      <section className="mb-8">
        <h2 className="mb-4 flex items-center text-xl font-semibold">
          <FontAwesomeIcon icon={faVault} className="mr-2 text-secondary" />
          Coffres
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {safes.map((safe) => (
            <ContainerCard
              key={safe.id}
              containerType="safe"
              container={safe}
              highlighted={safe.id === lastAddedSafeId}
              editing={editingSafeId === safe.id}
              editName={editingSafeName}
              saving={savingSafe}
              onEditNameChange={setEditingSafeName}
              onStartEdit={() => startEditSafe(safe)}
              onSaveEdit={handleSaveSafeName}
              onCancelEdit={cancelEditSafe}
              onDelete={() => handleDeleteSafe(safe.id)}
              scrollRef={safe.id === lastAddedSafeId ? addedSafeRef : undefined}
            />
          ))}
          <AddItemCard
            label="Ajouter un coffre"
            suggestions={SUGGESTED_SAFES}
            adding={addingSafe}
            onAddFromSuggestion={addSafe}
            onAddCustom={addSafe}
            open={showAddSafe}
            onOpenChange={setShowAddSafe}
          />
        </div>
        {safes.length === 0 && !showAddSafe && (
          <p className="mt-2 text-sm text-muted-foreground">
            Aucun coffre. Cliquez sur le "+" pour en ajouter.
          </p>
        )}
      </section>

      <ConfirmDialog
        open={confirmDeleteRoomId !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteRoomId(null); }}
        title="Supprimer la piece"
        description="Supprimer cette piece et toutes ses photos ?"
        confirmLabel="Supprimer"
        onConfirm={executeDeleteRoom}
      />

      <ConfirmDialog
        open={confirmDeleteSafeId !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteSafeId(null); }}
        title="Supprimer le coffre"
        description="Supprimer ce coffre et toutes ses photos ?"
        confirmLabel="Supprimer"
        onConfirm={executeDeleteSafe}
      />
    </div>
  );
}
