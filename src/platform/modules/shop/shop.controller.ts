import { shop } from './shop.service';
import { logger } from '@platform/core/error';
import type { IEventBus } from '@platform/core/events';

class ShopController {
  bind(events: IEventBus): () => void {
    const unsub = events.on('shop:purchase:request', async ({ itemId }) => {
      const item = shop.getItem(itemId);
      if (!item) {
        events.emit('shop:purchase:result', {
          itemId,
          success: false,
          message: 'item_not_found',
        });
        return;
      }

      const success = await shop.purchase(itemId);
      events.emit('shop:purchase:result', {
        itemId,
        success,
        price: item.price,
        message: success ? undefined : 'purchase_failed',
      });

      if (success) {
        logger.info('[ShopController] Purchase handled', { itemId, price: item.price });
      }
    });

    return unsub;
  }
}

export const shopController = new ShopController();
