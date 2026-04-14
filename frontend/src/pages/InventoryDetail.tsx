import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faDollarSign,
  faSpinner,
  faFilePdf,
  faEdit,
  faSave,
  faTimes,
  faUpload,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { inventoryApi } from '../services/api';
import type { InventoryDetail as InventoryDetailType } from '../services/api';
import EditableItem from '../components/EditableItem';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

export default function InventoryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [inventory, setInventory] = useState<InventoryDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [inventoryName, setInventoryName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [addingImages, setAddingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inventoryRef = useRef<InventoryDetailType | null>(null);

  useEffect(() => {
    if (inventory) {
      inventoryRef.current = inventory;
    }
  }, [inventory]);

  useEffect(() => {
    if (!id) return;

    loadInventory(true);

    const interval = setInterval(() => {
      if (inventoryRef.current?.status === 'processing') {
        loadInventory(false);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [id]);

  const loadInventory = async (showLoading = false) => {
    if (!id) return;

    try {
      if (showLoading) {
        setLoading(true);
      }
      const data = await inventoryApi.getById(id);
      setInventory(data);
      setInventoryName(data.name || '');
    } catch {
      if (showLoading) {
        toast.error('Erreur lors du chargement de l\'inventaire');
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const handleSaveName = async () => {
    if (!id) return;
    try {
      setSavingName(true);
      await inventoryApi.update(id, { name: inventoryName || undefined });
      setEditingName(false);
      loadInventory(false);
    } catch {
      toast.error('Erreur lors de la mise a jour du nom');
    } finally {
      setSavingName(false);
    }
  };

  const handleAddImages = async (files: File[]) => {
    if (!id || files.length === 0) return;
    try {
      setAddingImages(true);
      await inventoryApi.addImages(id, files);
      loadInventory(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch {
      toast.error('Erreur lors de l\'ajout des images');
    } finally {
      setAddingImages(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!id) return;

    try {
      setGeneratingReport(true);
      const blob = await inventoryApi.generateReport(id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory-report-${id}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Erreur lors de la generation du rapport');
    } finally {
      setGeneratingReport(false);
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

  if (!inventory) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertDescription>Inventaire non trouve</AlertDescription>
        </Alert>
      </div>
    );
  }

  const statusBadgeClass =
    inventory.status === 'completed'
      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      : inventory.status === 'processing'
      ? 'bg-primary/20 text-foreground'
      : inventory.status === 'error'
      ? 'bg-destructive/20 text-destructive'
      : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';

  const statusLabel =
    inventory.status === 'draft'
      ? 'Brouillon'
      : inventory.status === 'processing'
      ? 'En cours'
      : inventory.status === 'completed'
      ? 'Termine'
      : 'Erreur';

  return (
    <div className="container mx-auto px-4 py-8">
      <PageBreadcrumb
        items={[
          { label: 'Accueil', to: '/' },
          { label: 'Inventaire' },
          { label: inventory.name || 'Sans nom' },
        ]}
      />

      <Alert className="mb-4 border-amber-500/50 bg-amber-50 text-amber-900 dark:border-amber-500/50 dark:bg-amber-950 dark:text-amber-100">
        <AlertDescription>
          Ce format d'inventaire est en cours de remplacement. Pour vos nouveaux inventaires, creez un <button type="button" className="underline" onClick={() => navigate('/')}>lieu</button> et ajoutez-y vos pieces ou coffres.
        </AlertDescription>
      </Alert>

      <Card className="mb-6 shadow-lg">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    className="flex-1"
                    value={inventoryName}
                    onChange={(e) => setInventoryName(e.target.value)}
                    placeholder="Nom de l'inventaire"
                  />
                  <Button size="sm" onClick={handleSaveName} disabled={savingName}>
                    <FontAwesomeIcon icon={faSave} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingName(false);
                      setInventoryName(inventory.name || '');
                    }}
                    disabled={savingName}
                  >
                    <FontAwesomeIcon icon={faTimes} />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="break-words text-3xl font-bold">
                    {inventory.name || `Inventaire #${inventory.id.slice(0, 8)}`}
                  </h1>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingName(true)}
                    title="Modifier le nom"
                  >
                    <FontAwesomeIcon icon={faEdit} />
                  </Button>
                </div>
              )}
            </div>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass}`}>
              {inventory.status === 'processing' && (
                <FontAwesomeIcon icon={faSpinner} className="mr-2 animate-spin" />
              )}
              {statusLabel}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Valeur totale estimee</p>
              <p className="text-2xl font-bold text-primary">
                <FontAwesomeIcon icon={faDollarSign} className="mr-1" />
                {inventory.totalEstimatedValue.toFixed(2)} CAD
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Montant d'assurance recommande</p>
              <p className="text-2xl font-bold text-secondary">
                <FontAwesomeIcon icon={faDollarSign} className="mr-1" />
                {inventory.recommendedInsuranceAmount.toFixed(2)} CAD
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) {
                  handleAddImages(files);
                }
              }}
            />
            <Button
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={addingImages}
            >
              {addingImages ? (
                <>
                  <Spinner className="mr-2 size-4" />
                  Ajout...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faUpload} className="mr-2" />
                  Ajouter des images
                </>
              )}
            </Button>
            {inventory.status === 'completed' && (
              <Button
                onClick={handleGenerateReport}
                disabled={generatingReport}
              >
                {generatingReport ? (
                  <>
                    <Spinner className="mr-2 size-4" />
                    Generation...
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faFilePdf} className="mr-2" />
                    Generer le rapport PDF
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {inventory.status === 'processing' && (
        <Card className="mb-6 shadow-md">
          <CardContent className="p-6">
            <div className="mb-4 flex items-center justify-center">
              <FontAwesomeIcon
                icon={faSpinner}
                className="mr-4 text-4xl text-primary animate-spin"
              />
              <div>
                <h3 className="text-lg font-semibold">Analyse en cours</h3>
                <p className="text-sm text-muted-foreground">
                  Traitement des images en cours...
                </p>
              </div>
            </div>

            <div className="my-4 h-px bg-border" />

            <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
              <div className="rounded-lg bg-muted p-4">
                <div className="text-xs text-muted-foreground">Images a traiter</div>
                <div className="text-2xl font-bold">{inventory.images.length}</div>
              </div>
              <div className="rounded-lg bg-muted p-4">
                <div className="text-xs text-muted-foreground">Objets identifies</div>
                <div className="text-2xl font-bold text-primary">
                  {inventory.items ? inventory.items.length : 0}
                </div>
              </div>
              <div className="rounded-lg bg-muted p-4">
                <div className="text-xs text-muted-foreground">Valeur totale</div>
                <div className="text-2xl font-bold text-secondary">
                  ${inventory.totalEstimatedValue.toFixed(2)}
                </div>
              </div>
            </div>

            {inventory.metadata && (
              <div className="mt-4">
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                    Details de traitement (debogage)
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-muted p-4 text-xs">
                    {JSON.stringify(inventory.metadata, null, 2)}
                  </pre>
                </details>
              </div>
            )}

            {inventory.items && inventory.items.length === 0 && (
              <Alert className="mt-4 border-amber-500/50 bg-amber-50 text-amber-900 dark:border-amber-500/50 dark:bg-amber-950 dark:text-amber-100">
                <FontAwesomeIcon icon={faTriangleExclamation} className="size-4" />
                <AlertDescription>
                  <span className="font-bold">Aucun objet identifie pour le moment</span>
                  <span className="mt-1 block text-xs">
                    Le traitement est en cours. Cela peut prendre quelques instants.
                  </span>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {inventory.status === 'error' && (
        <Card className="mb-6 border-destructive/50 shadow-md">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-destructive">Erreur lors du traitement</h3>
            <p className="text-muted-foreground">
              Une erreur s'est produite lors de l'analyse des images.
            </p>
            {inventory.metadata && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                  Details de l'erreur (debogage)
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-muted p-4 text-xs">
                  {JSON.stringify(inventory.metadata, null, 2)}
                </pre>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {inventory.status === 'completed' && (!inventory.items || inventory.items.length === 0) && (
        <Card className="mb-6 border-amber-500/50 shadow-md">
          <CardContent className="p-6">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-amber-700 dark:text-amber-300">
              <FontAwesomeIcon icon={faTriangleExclamation} />
              Aucun objet identifie
            </h3>
            <p className="text-muted-foreground">
              Le traitement est termine, mais aucun objet n'a ete identifie dans les images.
            </p>
            {inventory.metadata && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                  Informations de debogage
                </summary>
                <div className="mt-2 space-y-2 text-sm">
                  <p><strong>Images traitees:</strong> {String(inventory.metadata.imageCount ?? 0)}</p>
                  <p><strong>Objets trouves:</strong> {String(inventory.metadata.itemCount ?? 0)}</p>
                  {Array.isArray(inventory.metadata.errors) && inventory.metadata.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="font-semibold text-destructive">Erreurs:</p>
                      <ul className="list-inside list-disc text-xs">
                        {(inventory.metadata.errors as string[]).map((error: string, idx: number) => (
                          <li key={idx} className="text-destructive">{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs">JSON complet (debogage)</summary>
                    <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-muted p-4 text-xs">
                      {JSON.stringify(inventory.metadata, null, 2)}
                    </pre>
                  </details>
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {inventory.items && inventory.items.length > 0 && (
        <div>
          <h2 className="mb-4 text-2xl font-bold">Objets identifies ({inventory.items.length})</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {inventory.items.map((item) => (
              <EditableItem
                key={item.id}
                item={item}
                inventoryId={inventory.id}
                onUpdate={loadInventory}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
