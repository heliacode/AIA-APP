import prisma from '../database/client';
import type { ItemCategory, ItemCondition, Prisma } from '@prisma/client';
import { InventoryStatus, InventoryResponse } from '../types';
import { openaiService } from './openai.service';
import { pricingService } from './pricing.service';
import { calculationService } from './calculation.service';
import { imageService } from './image.service';
import { AppError } from '../utils/app-error';
import { getErrorMessage } from '../utils/get-error-message';

class InventoryService {
  async createInventory(userId: string, name?: string) {
    return await prisma.inventory.create({
      data: {
        userId,
        name: name || null,
        status: 'draft',
        totalEstimatedValue: 0,
        recommendedInsuranceAmount: 0,
        metadata: {},
      },
    });
  }

  async startProcessing(inventoryId: string) {
    // Update status to processing
    await prisma.inventory.update({
      where: { id: inventoryId },
      data: { status: 'processing' },
    });

    // Process images asynchronously
    this.processInventory(inventoryId).catch((error) => {
      console.error(`Error processing inventory ${inventoryId}:`, error);
      prisma.inventory.update({
        where: { id: inventoryId },
        data: { status: 'error' },
      });
    });
  }

  private async processInventory(inventoryId: string) {
    // Get all images for this inventory
    const images = await prisma.inventoryImage.findMany({
      where: { inventoryId },
      orderBy: { uploadOrder: 'asc' },
    });

    console.log(`[Inventory ${inventoryId}] Starting processing of ${images.length} image(s)`);

    let processedImages = 0;
    let totalItemsFound = 0;
    const errors: string[] = [];

    // Process each image
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      try {
        console.log(`[Inventory ${inventoryId}] Processing image ${i + 1}/${images.length}: ${image.fileName}`);
        
        // Update metadata with current processing status
        await prisma.inventory.update({
          where: { id: inventoryId },
          data: {
            metadata: {
              processing: {
                currentImage: i + 1,
                totalImages: images.length,
                processedImages,
                itemsFound: totalItemsFound,
              },
            },
          },
        });

        // Call OpenAI Vision API
        const { items } = await openaiService.analyzeImage(image.imageData, image.imageType);
        
        console.log(`[Inventory ${inventoryId}] Image ${i + 1} analysis complete: ${items.length} item(s) found`);

        let firstItemId: string | null = null;

        // For each item, create inventory item (user will enter values manually)
        for (const itemData of items) {
          // Create inventory item with source image ID in metadata
          // User will enter estimated/replacement values manually, so we set them to 0 initially
          const createdItem = await prisma.inventoryItem.create({
            data: {
              inventoryId,
              category: itemData.category,
              itemName: itemData.name,
              brand: itemData.brand,
              model: itemData.model,
              condition: itemData.condition,
              estimatedAge: itemData.estimatedAge,
              estimatedValue: 0, // User will enter this manually
              replacementValue: 0, // User will enter this manually
              aiAnalysis: {
                description: itemData.description,
                confidence: 0.85, // Default confidence
                sourceImageId: image.id, // Store the source image ID
                boundingBox: itemData.boundingBox ? {
                  x: itemData.boundingBox.x,
                  y: itemData.boundingBox.y,
                  width: itemData.boundingBox.width,
                  height: itemData.boundingBox.height,
                } : undefined, // Convert to plain object for Prisma JSON
              },
              priceData: {}, // Empty since we're not using automatic pricing
            },
          });

          // Link the image to the first item created from it
          // (Since one image can contain multiple items, we link to the first one)
          if (!firstItemId) {
            firstItemId = createdItem.id;
            await prisma.inventoryImage.update({
              where: { id: image.id },
              data: { itemId: createdItem.id },
            });
          }
        }
        
        processedImages++;
        totalItemsFound += items.length;
        console.log(`[Inventory ${inventoryId}] Image ${i + 1} processed successfully: ${items.length} item(s) created`);
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error, 'Unknown error');
        console.error(`[Inventory ${inventoryId}] Error processing image ${i + 1} (${image.fileName}):`, errorMessage);
        errors.push(`Image ${i + 1} (${image.fileName}): ${errorMessage}`);
      }
    }
    
    console.log(`[Inventory ${inventoryId}] Processing complete: ${processedImages}/${images.length} images processed, ${totalItemsFound} total items found`);

    // Calculate totals
    const items = await prisma.inventoryItem.findMany({
      where: { inventoryId },
    });

    const totalValue = items.reduce((sum, item) => sum + Number(item.replacementValue), 0);

    // Update inventory status
    const finalMetadata: Record<string, unknown> = {
      itemCount: items.length,
      imageCount: images.length,
      processedImages,
      totalItemsFound,
    };

    if (errors.length > 0) {
      finalMetadata.errors = errors;
      console.warn(`[Inventory ${inventoryId}] Completed with ${errors.length} error(s):`, errors);
    }

    await prisma.inventory.update({
      where: { id: inventoryId },
      data: {
        status: items.length > 0 ? 'completed' : (errors.length > 0 ? 'error' : 'completed'),
        totalEstimatedValue: totalValue,
        recommendedInsuranceAmount: totalValue,
        metadata: finalMetadata as Prisma.InputJsonObject,
      },
    });

    if (items.length === 0) {
      console.warn(`[Inventory ${inventoryId}] WARNING: Processing completed but no items were found!`);
      if (errors.length > 0) {
        console.warn(`[Inventory ${inventoryId}] Errors encountered:`, errors);
      }
    } else {
      console.log(`[Inventory ${inventoryId}] Successfully completed: ${items.length} item(s), $${totalValue.toFixed(2)} total value`);
    }
  }

  async getInventoryById(id: string, userId: string): Promise<InventoryResponse | null> {
    const inventory = await prisma.inventory.findFirst({
      where: { id, userId },
      include: {
        items: {
          include: {
            images: {
              select: {
                id: true,
                fileName: true,
                fileSize: true,
                uploadOrder: true,
                createdAt: true,
              },
            },
          },
        },
        images: {
          select: {
            id: true,
            fileName: true,
            fileSize: true,
            uploadOrder: true,
            createdAt: true,
          },
        },
      },
    });

    if (!inventory) return null;

    return {
      id: inventory.id,
      name: inventory.name || undefined,
      status: inventory.status as InventoryStatus,
      totalEstimatedValue: Number(inventory.totalEstimatedValue),
      recommendedInsuranceAmount: Number(inventory.recommendedInsuranceAmount),
      metadata: inventory.metadata as Record<string, unknown>,
      createdAt: inventory.createdAt,
      updatedAt: inventory.updatedAt,
      items: inventory.items.map((item) => {
        const aiAnalysis = item.aiAnalysis as Record<string, unknown>;
        const sourceImageId = aiAnalysis?.sourceImageId;
        
        // Get images: direct relation + source image from metadata
        const directImages = item.images?.map((img) => ({
          id: img.id,
          fileName: img.fileName,
          fileSize: img.fileSize,
          uploadOrder: img.uploadOrder,
          createdAt: img.createdAt,
        })) || [];
        
        // If source image is not in direct images, find it from inventory images
        let allImages = [...directImages];
        if (sourceImageId && !directImages.find((img) => img.id === sourceImageId)) {
          const sourceImage = inventory.images.find((img) => img.id === sourceImageId);
          if (sourceImage) {
            allImages.push({
              id: sourceImage.id,
              fileName: sourceImage.fileName,
              fileSize: sourceImage.fileSize,
              uploadOrder: sourceImage.uploadOrder,
              createdAt: sourceImage.createdAt,
            });
          }
        }
        
        return {
          id: item.id,
          category: item.category as ItemCategory,
          itemName: item.itemName,
          brand: item.brand || undefined,
          model: item.model || undefined,
          condition: item.condition as ItemCondition,
          estimatedAge: item.estimatedAge || undefined,
          notes: item.notes || undefined,
          estimatedValue: Number(item.estimatedValue),
          replacementValue: Number(item.replacementValue),
          aiAnalysis: aiAnalysis as Record<string, unknown>,
          priceData: item.priceData as Record<string, unknown>,
          images: allImages,
        };
      }),
      images: inventory.images.map((img) => ({
        id: img.id,
        fileName: img.fileName,
        fileSize: img.fileSize,
        uploadOrder: img.uploadOrder,
        createdAt: img.createdAt,
      })),
    };
  }

  async listInventories(userId: string, page: number, limit: number, status?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.InventoryWhereInput = { userId };
    if (status) {
      where.status = status as InventoryStatus;
    }

    const [data, total] = await Promise.all([
      prisma.inventory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          status: true,
          totalEstimatedValue: true,
          recommendedInsuranceAmount: true,
          createdAt: true,
          _count: {
            select: {
              items: true,
            },
          },
        },
      }),
      prisma.inventory.count({ where }),
    ]);

    return {
      data: data.map((inv) => ({
        id: inv.id,
        name: (inv.name as string | null) || undefined,
        status: inv.status,
        totalEstimatedValue: Number(inv.totalEstimatedValue),
        itemCount: inv._count.items,
        createdAt: inv.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateItem(
    inventoryId: string,
    itemId: string,
    userId: string,
    updates: {
      itemName?: string;
      category?: string;
      brand?: string;
      model?: string;
      condition?: string;
      estimatedAge?: number;
      notes?: string;
      estimatedValue?: number;
      replacementValue?: number;
    }
  ) {
    // Verify inventory exists and belongs to user
    const inventory = await prisma.inventory.findFirst({ 
      where: { id: inventoryId, userId } 
    });
    if (!inventory) {
      throw AppError.notFound('Inventory');
    }

    // Verify item exists and belongs to inventory
    const item = await prisma.inventoryItem.findFirst({
      where: {
        id: itemId,
        inventoryId,
      },
    });

    if (!item) {
      throw AppError.notFound('Item');
    }

    // Build update data
    const updateData: Prisma.InventoryItemUpdateInput = {};
    if (updates.itemName !== undefined) updateData.itemName = updates.itemName;
    if (updates.category !== undefined) updateData.category = updates.category as ItemCategory;
    if (updates.brand !== undefined) updateData.brand = updates.brand || null;
    if (updates.model !== undefined) updateData.model = updates.model || null;
    if (updates.condition !== undefined) updateData.condition = updates.condition as ItemCondition;
    if (updates.estimatedAge !== undefined) updateData.estimatedAge = updates.estimatedAge || null;
    if (updates.notes !== undefined) updateData.notes = updates.notes || null;
    if (updates.estimatedValue !== undefined) updateData.estimatedValue = updates.estimatedValue;
    if (updates.replacementValue !== undefined) updateData.replacementValue = updates.replacementValue;

    // Update item
    const updatedItem = await prisma.inventoryItem.update({
      where: { id: itemId },
      data: updateData,
    });

    // Recalculate inventory totals
    const allItems = await prisma.inventoryItem.findMany({
      where: { inventoryId },
    });

    const totalValue = allItems.reduce((sum, item) => sum + Number(item.replacementValue), 0);

    await prisma.inventory.update({
      where: { id: inventoryId },
      data: {
        totalEstimatedValue: totalValue,
        recommendedInsuranceAmount: totalValue,
      },
    });

    return {
      id: updatedItem.id,
      category: updatedItem.category,
      itemName: updatedItem.itemName,
      brand: updatedItem.brand || undefined,
      model: updatedItem.model || undefined,
      condition: updatedItem.condition,
      estimatedAge: updatedItem.estimatedAge || undefined,
      notes: updatedItem.notes || undefined,
      estimatedValue: Number(updatedItem.estimatedValue),
      replacementValue: Number(updatedItem.replacementValue),
      aiAnalysis: updatedItem.aiAnalysis as Record<string, any>,
      priceData: updatedItem.priceData as Record<string, any>,
    };
  }

  async deleteItem(inventoryId: string, itemId: string, userId: string) {
    // Verify inventory exists and belongs to user
    const inventory = await prisma.inventory.findFirst({ 
      where: { id: inventoryId, userId } 
    });
    if (!inventory) {
      throw AppError.notFound('Inventory');
    }

    // Verify item exists and belongs to inventory
    const item = await prisma.inventoryItem.findFirst({
      where: {
        id: itemId,
        inventoryId,
      },
    });

    if (!item) {
      throw AppError.notFound('Item');
    }

    // Delete the item (cascade will handle related images)
    await prisma.inventoryItem.delete({
      where: { id: itemId },
    });

    // Recalculate inventory totals
    const allItems = await prisma.inventoryItem.findMany({
      where: { inventoryId },
    });

    const totalValue = allItems.reduce((sum, item) => sum + Number(item.replacementValue), 0);

    await prisma.inventory.update({
      where: { id: inventoryId },
      data: {
        totalEstimatedValue: totalValue,
        recommendedInsuranceAmount: totalValue,
      },
    });
  }

  async updateInventory(id: string, userId: string, updates: { name?: string }) {
    const inventory = await prisma.inventory.findFirst({ 
      where: { id, userId } 
    });
    if (!inventory) {
      throw AppError.notFound('Inventory');
    }

    const updateData: Prisma.InventoryUpdateInput = {};
    if (updates.name !== undefined) updateData.name = updates.name || null;

    return await prisma.inventory.update({
      where: { id },
      data: updateData,
    });
  }

  async addImagesToInventory(inventoryId: string, userId: string, files: Express.Multer.File[]) {
    const inventory = await prisma.inventory.findFirst({ 
      where: { id: inventoryId, userId } 
    });
    if (!inventory) {
      throw AppError.notFound('Inventory');
    }

    // Get current max uploadOrder
    const existingImages = await prisma.inventoryImage.findMany({
      where: { inventoryId },
      orderBy: { uploadOrder: 'desc' },
      take: 1,
    });

    const startOrder = existingImages.length > 0 ? existingImages[0].uploadOrder + 1 : 0;

    // Save new images
    for (let i = 0; i < files.length; i++) {
      await imageService.saveImage(inventoryId, files[i], startOrder + i);
    }

    // If inventory is completed, restart processing with new images
    if (inventory.status === 'completed') {
      await this.startProcessing(inventoryId);
    }

    return { message: `${files.length} image(s) added successfully` };
  }

  async deleteInventory(id: string, userId: string) {
    const inventory = await prisma.inventory.findFirst({ 
      where: { id, userId } 
    });
    if (!inventory) {
      throw AppError.notFound('Inventory');
    }

    await prisma.inventory.delete({ where: { id } });
  }
}

export const inventoryService = new InventoryService();
