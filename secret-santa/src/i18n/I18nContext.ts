import { createContext } from 'react'
import type { I18nContextValue } from '../models'
import type { TranslationKey } from './translations'

export const I18nContext = createContext<
  I18nContextValue<TranslationKey> | null
>(null)
