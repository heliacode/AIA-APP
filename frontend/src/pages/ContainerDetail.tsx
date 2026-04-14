import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faUpload,
  faImage,
  faCamera,
  faTrash,
  faMagic,
  faBox,
  faPen,
  faCheck,
  faTimes,
  faDollarSign,
} from '@fortawesome/free-solid-svg-icons';
import ImageWithBoundingBoxes from '@/components/ImageWithBoundingBoxes';
import ImageWithBoundingBox from '@/components/ImageWithBoundingBox';
import ConfirmDialog from '@/components/ConfirmDialog';
import { createContainerApi, visionModelsApi } from '@/services/api';
import type { Container, ContainerDetectedItem, VisionModel } from '@/services/api';
import type { ContainerType } from '@/constants/container-config';
import { getContainerUIConfig } from '@/constants/container-config';
import { getApiError } from '@/utils/get-api-error';
import { usePriceEstimation } from '@/hooks/use-price-estimation';
import { SUGGESTED_OBJECTS } from '@/constants/suggestions';
import { CATEGORY_LABELS as categoryLabels } from '@/constants/categories';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { Progress } from '@/components/ui/progress';
import PageBreadcrumb from '@/components/PageBreadcrumb';

const conditionLabels: Record<string, string> = {
  new: 'Neuf',
  excellent: 'Excellent',
  good: 'Bon',
  fair: 'Passable',
  poor: 'Mauvais',
};

interface ContainerDetailProps {
  containerType: ContainerType;
}

export default function ContainerDetail({ containerType }: ContainerDetailProps) {
  const config = getContainerUIConfig(containerType);
  const containerApi = createContainerApi(containerType);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const autoCapture = searchParams.get('autoCapture') === '1';
  const [container, setContainer] = useState<Container | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemEditForm, setItemEditForm] = useState<Partial<ContainerDetectedItem>>({});
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [visionModels, setVisionModels] = useState<VisionModel[]>([]);
  const [selectedVisionModel, setSelectedVisionModel] = useState<string>('gpt-5.2');
  const [selectedRunId, setSelectedRunId] = useState<string | 'manual' | 'all' | null>(null);
  const [confirmDeleteImageId, setConfirmDeleteImageId] = useState<string | null>(null);
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);
  const { estimating, error: pricingError, estimate: handleEstimatePrices } = usePriceEstimation(
    id,
    containerType,
    () => loadContainer(true)
  );

  const loadContainer = async (silent = false) => {
    if (!id) return;
    try {
      if (!silent) setLoading(true);
      const data = await containerApi.getById(id);
      setContainer(data);
    } catch {
      setContainer(null);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadContainer();
  }, [id]);

  useEffect(() => {
    visionModelsApi.getList().then((list) => {
      setVisionModels(list);
      if (list.length > 0 && !list.some((m) => m.id === selectedVisionModel)) {
        setSelectedVisionModel(list[0].id);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!container || container.analysisStatus !== 'processing') return;
    const t = setInterval(() => loadContainer(true), 2500);
    return () => clearInterval(t);
  }, [container?.analysisStatus, id]);

  // Default selected tab when container/analysisRuns load
  useEffect(() => {
    if (!container) return;
    const runs = container.analysisRuns ?? [];
    const manual = (container.items ?? []).filter((i) => !i.containerRunId);
    if (selectedRunId === null && runs.length > 0) {
      setSelectedRunId(runs[0].id);
    } else if (selectedRunId === null && manual.length > 0 && runs.length === 0) {
      setSelectedRunId('manual');
    } else if (selectedRunId === null && (container.items?.length ?? 0) > 0) {
      setSelectedRunId('all');
    }
  }, [container?.id, container?.analysisRuns?.length, container?.items?.length]);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // Tabs: one per analysis run (model) + optional "Manual" tab for comparing results
  const analysisRuns = container?.analysisRuns ?? [];
  const manualItems = (container?.items ?? []).filter((i) => !i.containerRunId);
  const modelLabel = (modelId: string) => visionModels.find((m) => m.id === modelId)?.label ?? modelId;
  const formatRunDate = (createdAt: string) =>
    new Date(createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  const tabs: { id: string; label: string; count: number }[] = [];
  analysisRuns.forEach((run) => {
    tabs.push({
      id: run.id,
      label: `${modelLabel(run.modelId)} – ${formatRunDate(run.createdAt)}`,
      count: run.items?.length ?? 0,
    });
  });
  if (manualItems.length > 0) {
    tabs.push({ id: 'manual', label: 'Ajoutes manuellement', count: manualItems.length });
  }
  if (tabs.length === 0 && (container?.items?.length ?? 0) > 0) {
    tabs.push({ id: 'all', label: 'Tous les objets', count: container!.items!.length });
  }
  const displayedItems: ContainerDetectedItem[] =
    selectedRunId === 'manual'
      ? manualItems
      : selectedRunId === 'all' || !selectedRunId
        ? container?.items ?? []
        : analysisRuns.find((r) => r.id === selectedRunId)?.items ?? [];

  const uploadImages = async (files: File[]) => {
    if (!id || files.length === 0) return;
    const maxSize = 10 * 1024 * 1024;
    const accepted = files.filter(
      (f) => f.size <= maxSize && (f.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(f.name))
    );
    if (accepted.length === 0) {
      toast.warning('Fichiers non valides ou trop volumineux (max 10 Mo).');
      return;
    }
    try {
      setUploading(true);
      await containerApi.addImages(id, accepted);
      loadContainer();
    } catch (err: unknown) {
      toast.error(getApiError(err, 'Erreur lors de l\'ajout des photos'));
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp'] },
    maxSize: 10 * 1024 * 1024,
    onDrop: async (acceptedFiles) => {
      if (!id || acceptedFiles.length === 0) return;
      try {
        setUploading(true);
        await containerApi.addImages(id, acceptedFiles);
        loadContainer();
      } catch (err: unknown) {
        toast.error(getApiError(err, 'Erreur lors de l\'ajout des photos'));
      } finally {
        setUploading(false);
      }
    },
    noClick: false,
  });

  const handleCameraFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.length) {
      uploadImages(Array.from(files));
    }
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };
  const handleGalleryFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.length) {
      uploadImages(Array.from(files));
    }
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const handleDeleteImage = (imageId: string) => {
    if (!id) return;
    setConfirmDeleteImageId(imageId);
  };

  const executeDeleteImage = async () => {
    if (!id || !confirmDeleteImageId) return;
    try {
      setDeletingId(confirmDeleteImageId);
      await containerApi.deleteImage(id, confirmDeleteImageId);
      loadContainer();
    } catch {
      toast.error('Erreur lors de la suppression');
      throw new Error();
    } finally {
      setDeletingId(null);
    }
  };

  const handleAnalyze = async () => {
    if (!id || container?.images.length === 0) return;
    try {
      setAnalyzing(true);
      await containerApi.analyze(id, selectedVisionModel);
      await loadContainer(true);
    } catch (err: unknown) {
      toast.error(getApiError(err, 'Erreur lors du lancement de l\'analyse'));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAddSuggestedObject = async (obj: { name: string; category: string }) => {
    if (!id) return;
    try {
      setAddingItem(true);
      await containerApi.addItem(id, {
        itemName: obj.name,
        category: obj.category,
        condition: 'good',
      });
      await loadContainer(true);
    } catch (err: unknown) {
      toast.error(getApiError(err, 'Erreur lors de l\'ajout'));
    } finally {
      setAddingItem(false);
    }
  };

  const handleDeleteItem = (itemId: string) => {
    if (!id) return;
    setConfirmDeleteItemId(itemId);
  };

  const executeDeleteItem = async () => {
    if (!id || !confirmDeleteItemId) return;
    try {
      setDeletingItemId(confirmDeleteItemId);
      await containerApi.deleteItem(id, confirmDeleteItemId);
      await loadContainer(true);
    } catch {
      toast.error('Erreur lors de la suppression');
      throw new Error();
    } finally {
      setDeletingItemId(null);
    }
  };

  const startEditName = () => {
    setNameInput(container?.name ?? '');
    setEditingName(true);
  };
  const cancelEditName = () => {
    setEditingName(false);
    setNameInput('');
  };
  const handleSaveName = async () => {
    if (!id || !nameInput.trim()) return;
    try {
      setSavingName(true);
      await containerApi.update(id, nameInput.trim());
      setContainer((c) => (c ? { ...c, name: nameInput.trim() } : c));
      cancelEditName();
    } catch (err: unknown) {
      toast.error(getApiError(err, 'Erreur'));
    } finally {
      setSavingName(false);
    }
  };

  const startEditItem = (item: ContainerDetectedItem) => {
    setEditingItemId(item.id);
    setItemEditForm({
      itemName: item.itemName,
      category: item.category,
      condition: item.condition,
      estimatedValue: item.estimatedValue,
      replacementValue: item.replacementValue,
      notes: item.notes ?? '',
    });
  };
  const cancelEditItem = () => {
    setEditingItemId(null);
    setItemEditForm({});
  };
  const handleSaveItem = async () => {
    if (!id || !editingItemId || !itemEditForm.itemName?.trim() || !itemEditForm.category || !itemEditForm.condition) return;
    try {
      setSavingItemId(editingItemId);
      await containerApi.updateItem(id, editingItemId, {
        itemName: itemEditForm.itemName.trim(),
        category: itemEditForm.category,
        condition: itemEditForm.condition,
        estimatedValue: itemEditForm.estimatedValue,
        replacementValue: itemEditForm.replacementValue,
        notes: itemEditForm.notes ?? undefined,
      });
      await loadContainer(true);
      cancelEditItem();
    } catch (err: unknown) {
      toast.error(getApiError(err, 'Erreur'));
    } finally {
      setSavingItemId(null);
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

  if (!container) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertDescription>{config.notFoundLabel}</AlertDescription>
        </Alert>
        <Button type="button" variant="ghost" className="mt-4" onClick={() => navigate('/')}>
          <FontAwesomeIcon icon={faArrowLeft} className="mr-2" />
          Retour
        </Button>
      </div>
    );
  }

  const images = container.images ?? [];

  const processedCount = container.analysisMetadata?.processedImages ?? 0;
  const totalCount = container.analysisMetadata?.totalImages ?? 0;
  const progressPct = totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <PageBreadcrumb
        items={[
          { label: 'Accueil', to: '/' },
          ...(container.location
            ? [{ label: container.location.name, to: `/location/${container.location.id}` }]
            : []),
          { label: container.name },
        ]}
      />

      <Card className="mb-6 shadow-lg">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 flex-wrap">
            {editingName ? (
              <>
                <Input
                  type="text"
                  className="min-w-[200px] flex-1"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') cancelEditName();
                  }}
                  autoFocus
                />
                <Button
                  type="button"
                  variant={config.buttonVariant}
                  size="sm"
                  onClick={handleSaveName}
                  disabled={savingName || !nameInput.trim()}
                  title="Enregistrer"
                >
                  <FontAwesomeIcon icon={faCheck} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cancelEditName}
                  disabled={savingName}
                  title="Annuler"
                >
                  <FontAwesomeIcon icon={faTimes} />
                </Button>
              </>
            ) : (
              <>
                <h1 className="text-3xl font-bold">{container.name}</h1>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={startEditName}
                  title={config.editNameTitle}
                >
                  <FontAwesomeIcon icon={faPen} />
                </Button>
              </>
            )}
          </div>
          <p className="text-muted-foreground">
            {container.location?.name && `Lieu : ${container.location.name}`}
          </p>
          {images.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Modele IA :</span>
                <select
                  className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm ring-2 ring-transparent focus:ring-2 focus:ring-ring"
                  value={selectedVisionModel}
                  onChange={(e) => setSelectedVisionModel(e.target.value)}
                  disabled={analyzing || container.analysisStatus === 'processing'}
                >
                  {visionModels.length === 0 ? (
                    <option value={selectedVisionModel}>—</option>
                  ) : (
                    visionModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))
                  )}
                </select>
              </label>
              <Button
                type="button"
                variant={config.buttonVariant}
                onClick={handleAnalyze}
                disabled={analyzing || container.analysisStatus === 'processing'}
              >
                {container.analysisStatus === 'processing' ? (
                  <>
                    <Spinner className="mr-2 size-4" data-icon="inline-start" />
                    Analyse en cours…
                    {totalCount > 0 && (
                      <span className="ml-2 opacity-80">
                        ({processedCount}/{totalCount})
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faMagic} className="mr-2" />
                    {analyzing ? 'Lancement…' : 'Lancer l\'analyse des objets'}
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {autoCapture && (
        <Card className="mb-4 border-primary/40 shadow-md ring-2 ring-primary/30">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium">Pret a prendre une photo ?</p>
              <p className="text-sm text-muted-foreground">
                Touchez le bouton pour ouvrir l'appareil photo.
              </p>
            </div>
            <Button
              type="button"
              variant={config.buttonVariant}
              autoFocus
              onClick={() => {
                (cameraInputRef.current ?? galleryInputRef.current)?.click();
                setSearchParams({}, { replace: true });
              }}
            >
              <FontAwesomeIcon icon={faCamera} className="mr-2" />
              Prendre une photo
            </Button>
          </CardContent>
        </Card>
      )}

      {container.analysisStatus === 'processing' && (
        <Card className="mb-4 shadow-sm">
          <CardContent className="flex items-center gap-4 p-4">
            <Spinner className="size-5" />
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium">Analyse en cours</span>
                <span className="text-muted-foreground">
                  {totalCount > 0 ? `${processedCount} / ${totalCount} photo${totalCount > 1 ? 's' : ''}` : 'Preparation…'}
                </span>
              </div>
              <Progress value={progressPct} />
            </div>
          </CardContent>
        </Card>
      )}

      {container.analysisStatus === 'error' && (
        <Alert className="mb-4 border-amber-500/50 bg-amber-50 text-amber-900 dark:border-amber-500/50 dark:bg-amber-950 dark:text-amber-100">
          <AlertDescription>
            {container.analysisMetadata?.errors?.length
              ? `Analyse terminee avec des erreurs : ${container.analysisMetadata.errors.join(' ; ')}`
              : container.analysisMetadata?.error ?? 'L\'analyse a echoue.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Mobile : Prendre une photo / Galerie (iOS & Android) */}
      {isMobile && (
        <div className="mb-4 flex gap-4">
          <Button
            type="button"
            variant={config.buttonVariant}
            className="flex-1"
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploading}
          >
            <FontAwesomeIcon icon={faCamera} className="mr-2" />
            Prendre une photo
          </Button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCameraFileSelect}
            className="hidden"
            aria-hidden
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleGalleryFileSelect}
            className="hidden"
            aria-hidden
          />
          <Button
            type="button"
            variant={config.galleryButtonVariant}
            className="flex-1"
            onClick={() => galleryInputRef.current?.click()}
            disabled={uploading}
          >
            <FontAwesomeIcon icon={faImage} className="mr-2" />
            Galerie
          </Button>
        </div>
      )}

      {/* Ajouter des photos */}
      <div
        {...getRootProps()}
        className={`mb-6 flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed ${config.borderDashed} bg-muted/50 transition-colors ${config.borderDashedHover}`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center p-6">
          <FontAwesomeIcon icon={faUpload} className={`mb-2 text-4xl ${config.accentColor}`} />
          <p className="text-center text-muted-foreground">
            {isDragActive ? 'Deposez les images ici' : isMobile ? 'Ou glissez des photos ici' : 'Glissez des photos ici ou cliquez pour selectionner'}
          </p>
          {uploading && <Spinner className="mt-2 size-6" />}
        </div>
      </div>

      {/* Liste des photos (avec rectangles de detection si analyse faite) */}
      {images.length > 0 && (
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="mb-4 flex items-center">
              <FontAwesomeIcon icon={faImage} className="mr-2" />
              Photos ({images.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {images.map((img) => {
                const itemsInImage = displayedItems.filter(
                  (item) =>
                    (item.containerImageId ?? item.aiAnalysis?.sourceImageId) === img.id && item.aiAnalysis?.boundingBox
                );
                const boxes = itemsInImage.map((item) => ({
                  boundingBox: item.aiAnalysis!.boundingBox!,
                  itemName: item.itemName,
                }));
                return (
                  <div key={img.id} className="relative group">
                    {boxes.length > 0 ? (
                      <ImageWithBoundingBoxes
                        imageUrl={containerApi.getImageUrl(id!, img.id)}
                        boxes={boxes}
                        className="w-full h-32"
                      />
                    ) : (
                      <img
                        src={containerApi.getImageUrl(id!, img.id)}
                        alt={img.fileName}
                        className="h-32 w-full rounded-lg border border-border object-cover"
                      />
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="absolute right-2 top-2 size-8 shadow-md"
                      onClick={() => handleDeleteImage(img.id)}
                      disabled={deletingId === img.id}
                      title="Supprimer la photo"
                    >
                      {deletingId === img.id ? (
                        <Spinner className="size-4" />
                      ) : (
                        <FontAwesomeIcon icon={faTrash} />
                      )}
                    </Button>
                    <p className="text-xs text-center mt-1 truncate" title={img.fileName}>
                      {img.fileName}
                      {boxes.length > 0 && (
                        <span className="block text-primary">({boxes.length} objet{boxes.length !== 1 ? 's' : ''})</span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Objets a considerer pour l'assurance (suggestions) */}
      <Card className="mt-6 shadow-md">
        <CardContent className="p-6">
          <label className="mb-2 block text-sm text-muted-foreground">
            Objets a considerer pour l'assurance (suggestions)
          </label>
          <select
            className="max-w-md"
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (v) {
                const idx = parseInt(v, 10);
                const obj = SUGGESTED_OBJECTS[idx];
                if (obj) handleAddSuggestedObject(obj);
                e.target.value = '';
              }
            }}
            disabled={addingItem}
          >
            <option value="">Choisir un objet a ajouter a l'inventaire…</option>
            {SUGGESTED_OBJECTS.map((obj, idx) => (
              <option key={`${obj.name}-${idx}`} value={idx}>
                {obj.name} ({categoryLabels[obj.category] ?? obj.category})
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Objets detectes / inventaire -- onglets par modele pour comparer */}
      {(container?.items?.length ?? 0) > 0 && (
        <Card className="mt-6 shadow-md">
          <CardHeader>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <CardTitle className="flex items-center">
                <FontAwesomeIcon icon={faBox} className="mr-2" />
                Objets / inventaire
              </CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleEstimatePrices}
                disabled={estimating}
                title="Estimer les prix via Google Shopping"
              >
                {estimating ? (
                  <Spinner className="mr-2 size-4" />
                ) : (
                  <FontAwesomeIcon icon={faDollarSign} className="mr-2" />
                )}
                {estimating ? 'Estimation...' : 'Estimer les prix'}
              </Button>
              {pricingError && (
                <span className="text-sm text-destructive">{pricingError}</span>
              )}
              {tabs.length > 1 && (
                <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSelectedRunId(tab.id)}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        selectedRunId === tab.id
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {displayedItems.map((item) => {
                const sourceImageId = item.containerImageId ?? item.aiAnalysis?.sourceImageId;
                const hasBox = item.aiAnalysis?.boundingBox;
                const isEditing = editingItemId === item.id;
                return (
                  <Card key={item.id} className="relative border border-border bg-muted/50">
                    <div className="absolute right-2 top-2 z-10 flex gap-1">
                      {!isEditing ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => startEditItem(item)}
                            disabled={savingItemId !== null}
                            title="Modifier"
                          >
                            <FontAwesomeIcon icon={faPen} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive"
                            onClick={() => handleDeleteItem(item.id)}
                            disabled={deletingItemId === item.id}
                            title="Supprimer"
                          >
                            {deletingItemId === item.id ? (
                              <Spinner className="size-4" />
                            ) : (
                              <FontAwesomeIcon icon={faTrash} />
                            )}
                          </Button>
                        </>
                      ) : null}
                    </div>
                    <CardContent className="p-4">
                      {isEditing ? (
                        <div className="space-y-2 pr-12">
                          <Input
                            className="h-8 w-full"
                            placeholder="Nom de l'objet"
                            value={itemEditForm.itemName ?? ''}
                            onChange={(e) => setItemEditForm((f) => ({ ...f, itemName: e.target.value }))}
                          />
                          <div className="flex flex-wrap gap-2">
                            <select
                              className="h-8 min-w-0 flex-1"
                              value={itemEditForm.category ?? ''}
                              onChange={(e) => setItemEditForm((f) => ({ ...f, category: e.target.value }))}
                            >
                              {Object.entries(categoryLabels).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                              ))}
                            </select>
                            <select
                              className="h-8 min-w-0 flex-1"
                              value={itemEditForm.condition ?? ''}
                              onChange={(e) => setItemEditForm((f) => ({ ...f, condition: e.target.value }))}
                            >
                              {Object.entries(conditionLabels).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              className="h-8 w-24"
                              placeholder="Valeur"
                              value={itemEditForm.estimatedValue ?? ''}
                              onChange={(e) => setItemEditForm((f) => ({ ...f, estimatedValue: e.target.value ? Number(e.target.value) : undefined }))}
                            />
                            <Input
                              type="number"
                              className="h-8 w-24"
                              placeholder="Remplacement"
                              value={itemEditForm.replacementValue ?? ''}
                              onChange={(e) => setItemEditForm((f) => ({ ...f, replacementValue: e.target.value ? Number(e.target.value) : undefined }))}
                            />
                          </div>
                          <Textarea
                            className="min-h-[60px] w-full resize-y text-sm"
                            placeholder="Notes"
                            value={itemEditForm.notes ?? ''}
                            onChange={(e) => setItemEditForm((f) => ({ ...f, notes: e.target.value }))}
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant={config.buttonVariant}
                              size="sm"
                              onClick={handleSaveItem}
                              disabled={savingItemId === item.id || !(itemEditForm.itemName?.trim() && itemEditForm.category && itemEditForm.condition)}
                            >
                              <FontAwesomeIcon icon={faCheck} className="mr-1" /> Enregistrer
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={cancelEditItem}
                              disabled={savingItemId !== null}
                            >
                              <FontAwesomeIcon icon={faTimes} className="mr-1" /> Annuler
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-3">
                          {sourceImageId && (
                            <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg border border-border">
                              {hasBox ? (
                                <ImageWithBoundingBox
                                  imageUrl={containerApi.getImageUrl(id!, sourceImageId)}
                                  boundingBox={item.aiAnalysis!.boundingBox!}
                                  itemName={item.itemName}
                                  className="w-full h-full"
                                />
                              ) : (
                                <img
                                  src={containerApi.getImageUrl(id!, sourceImageId)}
                                  alt={item.itemName}
                                  className="w-full h-full object-cover"
                                />
                              )}
                            </div>
                          )}
                          <div className="min-w-0 flex-1 pr-12">
                            <h3 className="font-bold break-words">{item.itemName}</h3>
                            <p className="text-xs text-muted-foreground">
                              {categoryLabels[item.category] ?? item.category} · {conditionLabels[item.condition] ?? item.condition}
                            </p>
                            {item.aiAnalysis?.description && (
                              <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{item.aiAnalysis.description}</p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                              <span className="font-semibold text-primary">{Number(item.estimatedValue).toFixed(2)} $</span>
                              <span className="text-muted-foreground">remplacement : {Number(item.replacementValue).toFixed(2)} $</span>
                              {Boolean(item.aiAnalysis?.pricing) && (() => {
                                const pricing = item.aiAnalysis.pricing as Record<string, unknown>;
                                return (
                                  <span
                                    className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900 dark:text-green-200"
                                    title={`Source: Google Shopping | ${String(pricing.sampleCount)} resultat(s) | Recherche: ${String(pricing.searchQuery)}`}
                                  >
                                    <FontAwesomeIcon icon={faDollarSign} className="mr-1" />
                                    estime
                                  </span>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDeleteImageId !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteImageId(null); }}
        title="Supprimer la photo"
        description="Supprimer cette photo ? Les objets detectes sur cette photo seront aussi supprimes."
        confirmLabel="Supprimer"
        onConfirm={executeDeleteImage}
      />

      <ConfirmDialog
        open={confirmDeleteItemId !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteItemId(null); }}
        title="Supprimer l'objet"
        description="Supprimer cet objet de la liste ?"
        confirmLabel="Supprimer"
        onConfirm={executeDeleteItem}
      />
    </div>
  );
}
