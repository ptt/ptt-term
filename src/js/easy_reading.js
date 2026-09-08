// Re-export EasyReading from src/plugins/easy_reading for backward compatibility
export {
  EasyReading,
  EasyReading as EasyReadingPlugin,
  INFLIGHT_WATCHDOG_MS,
  MAX_INFLIGHT_RETRIES,
} from '../plugins/easy_reading/index.js';

import { EasyReading } from '../plugins/easy_reading/index.js';
export default EasyReading;
