import { useState, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUpload, faImage, faCamera } from '@fortawesome/free-solid-svg-icons';
import { inventoryApi } from '@/services/api';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function Upload() {
  const [files, setFiles] = useState<File[]>([]);
  const [inventoryName, setInventoryName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Map<number, string>>(new Map());
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    noClick: false, // Permettre les clics
    noKeyboard: false, // Permettre le clavier
    onDrop: (acceptedFiles) => {
      setFiles((prev) => [...prev, ...acceptedFiles]);
    },
  });

  // Detecter si on est sur mobile
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // Creer les previews URLs quand les fichiers changent
  useEffect(() => {
    const newUrls = new Map<number, string>();
    files.forEach((file, index) => {
      if (!previewUrls.has(index)) {
        newUrls.set(index, URL.createObjectURL(file));
      } else {
        newUrls.set(index, previewUrls.get(index)!);
      }
    });
    setPreviewUrls(newUrls);

    // Nettoyer les URLs supprimees
    return () => {
      previewUrls.forEach((url, index) => {
        if (!files[index]) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [files]);

  // Ouvrir la camera (getUserMedia: previsualisation in-app, ideal iOS/Android)
  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Camera arriere sur mobile (objet/inventaire)
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      setCameraStream(stream);
      setIsCameraOpen(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      // Fallback: input file avec capture pour ouvrir la camera native (iOS/Android)
      if (cameraInputRef.current) {
        cameraInputRef.current.click();
      } else {
        toast.warning('Impossible d\'acceder a la camera. Veuillez autoriser l\'acces ou utiliser le bouton "Galerie".');
      }
    }
  };

  // Prendre une photo depuis la camera
  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0);

        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], `photo_${Date.now()}.jpg`, {
              type: 'image/jpeg',
            });
            setFiles((prev) => [...prev, file]);
            closeCamera();
          }
        }, 'image/jpeg', 0.9);
      }
    }
  };

  // Fermer la camera
  const closeCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setIsCameraOpen(false);
  };

  // Fichiers depuis l'input camera (fallback quand getUserMedia echoue)
  const handleCameraFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (selectedFiles) {
      setFiles((prev) => [...prev, ...Array.from(selectedFiles)]);
    }
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  // Fichiers depuis la galerie (sans capture -> ouvre Photos / Gallery sur iOS et Android)
  const handleGalleryFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (selectedFiles) {
      setFiles((prev) => [...prev, ...Array.from(selectedFiles)]);
    }
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (files.length === 0) {
      toast.warning('Veuillez selectionner au moins une image');
      return;
    }

    try {
      setUploading(true);
      const inventory = await inventoryApi.create(files, inventoryName || undefined);
      navigate(`/inventory/${inventory.id}`);
    } catch {
      toast.error('Erreur lors de l\'upload. Veuillez reessayer.');
    } finally {
      setUploading(false);
    }
  };

  const removeFile = (index: number) => {
    // Nettoyer l'URL de l'image supprimee
    const urlToRevoke = previewUrls.get(index);
    if (urlToRevoke) {
      URL.revokeObjectURL(urlToRevoke);
    }

    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => {
      const newUrls = new Map(prev);
      newUrls.delete(index);
      // Reindexer les URLs restantes
      const reindexed = new Map<number, string>();
      files.forEach((_, i) => {
        if (i !== index && i < files.length) {
          const oldIndex = i > index ? i - 1 : i;
          if (prev.has(oldIndex)) {
            reindexed.set(i > index ? i - 1 : i, prev.get(oldIndex)!);
          }
        }
      });
      return reindexed;
    });
  };

  // Nettoyer les URLs et la camera lors du demontage
  useEffect(() => {
    return () => {
      // Nettoyer la camera
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
      // Nettoyer les URLs d'objets (sera fait lors du submit ou unmount)
    };
  }, [cameraStream]);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Nouvel Inventaire</h1>

      <Alert className="mb-4 border-amber-500/50 bg-amber-50 text-amber-900 dark:border-amber-500/50 dark:bg-amber-950 dark:text-amber-100">
        <AlertDescription>
          Ce format d'inventaire est en cours de remplacement. Pour organiser vos biens par piece ou coffre, <button type="button" className="underline font-medium" onClick={() => navigate('/')}>creez un lieu</button> depuis l'accueil.
        </AlertDescription>
      </Alert>

      <Card className="mb-4 shadow-md">
        <CardContent className="p-6">
          <div className="space-y-2">
            <Label>Nom de l'inventaire (optionnel)</Label>
            <Input
              type="text"
              className="w-full"
              placeholder="Ex: Maison principale, Salon, Chambre..."
              value={inventoryName}
              onChange={(e) => setInventoryName(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Boutons d'action rapide pour mobile -- camera et galerie correctement separes pour iOS/Android */}
      {isMobile && (
        <div className="mb-6 flex gap-4">
          <Button
            onClick={openCamera}
            className="flex-1"
            disabled={isCameraOpen}
          >
            <FontAwesomeIcon icon={faCamera} className="mr-2" />
            Prendre une photo
          </Button>
          {/* Input camera : capture="environment" pour ouvrir la camera arriere (fallback si getUserMedia echoue) */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCameraFileSelect}
            className="hidden"
            aria-hidden
          />
          {/* Input galerie : SANS capture pour ouvrir Photos / Gallery sur iOS et Android */}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            onChange={handleGalleryFileSelect}
            className="hidden"
            multiple
            aria-hidden
          />
          <Button
            onClick={() => galleryInputRef.current?.click()}
            variant="secondary"
            className="flex-1"
          >
            <FontAwesomeIcon icon={faImage} className="mr-2" />
            Galerie
          </Button>
        </div>
      )}

      {/* Vue camera */}
      {isCameraOpen && (
        <Card className="mb-6 shadow-xl">
          <CardHeader>
            <CardTitle className="mb-4 flex items-center">
              <FontAwesomeIcon icon={faCamera} className="mr-2" />
              Camera
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative overflow-hidden rounded-lg bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-auto max-h-[60vh]"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <div className="mt-4 flex justify-end gap-4">
              <Button variant="ghost" onClick={closeCamera}>
                Annuler
              </Button>
              <Button onClick={capturePhoto}>
                <FontAwesomeIcon icon={faCamera} className="mr-2" />
                Prendre la photo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Zone de drop/upload */}
      <div
        {...getRootProps()}
        className="mb-6 flex min-h-[300px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/30 bg-muted/50 transition-colors hover:border-primary/50"
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.tagName !== 'BUTTON' && target.closest('button') === null) {
            e.stopPropagation();
            open();
          }
        }}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center p-6">
          <FontAwesomeIcon icon={faUpload} className="mb-4 text-6xl text-primary" />
          <h3 className="mb-2 text-xl font-semibold">
            {isDragActive ? 'Deposez les images ici' : 'Glissez vos images ici'}
          </h3>
          <p className="mb-4 text-center text-muted-foreground">
            {isMobile
              ? 'Ou utilisez les boutons ci-dessus pour la camera'
              : 'Ou cliquez pour selectionner des fichiers'}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Formats supportes: JPG, PNG, WEBP (max 10MB)
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-4"
            onClick={(e) => {
              e.stopPropagation();
              open();
            }}
          >
            <FontAwesomeIcon icon={faImage} className="mr-2" />
            Selectionner des fichiers
          </Button>
        </div>
      </div>

      {files.length > 0 && (
        <Card className="mb-6 shadow-md">
          <CardHeader>
            <CardTitle className="mb-4 flex items-center">
              <FontAwesomeIcon icon={faImage} className="mr-2" />
              Images selectionnees ({files.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3">
              {files.map((file, index) => {
                const previewUrl = previewUrls.get(index);
                return (
                  <div key={index} className="group relative">
                    {previewUrl && (
                      <img
                        src={previewUrl}
                        alt={file.name}
                        className="h-32 w-full rounded-lg object-cover"
                      />
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="absolute right-2 top-2 size-8 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => removeFile(index)}
                    >
                      x
                    </Button>
                    <p className="mt-1 truncate text-center text-xs">{file.name}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-4">
        <Button variant="ghost" asChild>
          <a href="/">Annuler</a>
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={uploading || files.length === 0}
        >
          {uploading ? (
            <>
              <Spinner className="mr-2 size-4" data-icon="inline-start" />
              Traitement...
            </>
          ) : (
            <>
              <FontAwesomeIcon icon={faUpload} className="mr-2" />
              Creer l'inventaire
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
