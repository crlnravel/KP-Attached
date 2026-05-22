import { QUESTION_SCALE_VALUES } from '../../../../shared/contracts'

export const STIMULUS_EXPOSURE_DURATION_MS = 15_000
export const STIMULUS_RESPONSE_PROMPT = 'Apa yang Anda rasakan saat melihat gambar tersebut?'

export type StimulusAsset = {
  id: string
  label: string
  imageUrl: string
}

export type QuestionnaireSection = {
  relation: string
  items: string[]
}

const stimulusSources = [
  new URL('../../../../../resources/stimuli/stimuli-1.png', import.meta.url).href,
  new URL('../../../../../resources/stimuli/stimuli-2.png', import.meta.url).href,
  new URL('../../../../../resources/stimuli/stimuli-3.png', import.meta.url).href,
  new URL('../../../../../resources/stimuli/stimuli-4.png', import.meta.url).href,
  new URL('../../../../../resources/stimuli/stimuli-5.png', import.meta.url).href,
  new URL('../../../../../resources/stimuli/stimuli-6.png', import.meta.url).href,
  new URL('../../../../../resources/stimuli/stimuli-7.png', import.meta.url).href,
  new URL('../../../../../resources/stimuli/stimuli-8.png', import.meta.url).href,
  new URL('../../../../../resources/stimuli/stimuli-9.png', import.meta.url).href,
  new URL('../../../../../resources/stimuli/stimuli-10.png', import.meta.url).href,
  new URL('../../../../../resources/stimuli/stimuli-11.png', import.meta.url).href,
  new URL('../../../../../resources/stimuli/stimuli-12.png', import.meta.url).href,
  new URL('../../../../../resources/stimuli/stimuli-13.png', import.meta.url).href,
  new URL('../../../../../resources/stimuli/stimuli-14.png', import.meta.url).href
]

export const stimulusVideos: StimulusAsset[] = stimulusSources.map((imageUrl, index) => ({
  id: `stimulus-${String(index + 1).padStart(2, '0')}`,
  label: `Stimulus ${String(index + 1).padStart(2, '0')}`,
  imageUrl
}))

const ecrStemItems = [
  '1. Pada saat saya membutuhkan, berpaling pada orang ini bisa membantu',
  '2. Saya biasanya menceritakan masalah dan kekhawatiran saya pada orang ini',
  '3. Saya membicarakan banyak hal dengan orang ini',
  '4. Saya merasa mudah untuk bergantung pada orang ini',
  '5. Saya tidak merasa nyaman membuka diri pada orang ini',
  '6. Saya memilih untuk tidak menunjukkan apa yang saya rasakan di lubuk hati terdalam pada orang ini',
  '7. Saya sering khawatir orang ini tidak sungguh-sungguh peduli dengan saya',
  '8. Saya takut bahwa orang ini akan mengabaikan/meninggalkan saya',
  '9. Saya khawatir orang ini tidak peduli pada saya sepeduli saya padanya'
]

export const questionnaireSections: QuestionnaireSection[] = [
  { relation: 'Ibu', items: ecrStemItems },
  { relation: 'Ayah', items: ecrStemItems },
  { relation: 'Pasangan', items: ecrStemItems },
  { relation: 'Teman dekat', items: ecrStemItems }
]

export const scaleLabels = Object.fromEntries(
  QUESTION_SCALE_VALUES.map((value) => [
    value,
    value === 1
      ? 'Sangat tidak setuju'
      : value === 2
        ? 'Tidak setuju'
        : value === 3
          ? 'Agak tidak setuju'
          : value === 4
            ? 'Agak setuju'
            : value === 5
              ? 'Setuju'
              : 'Sangat setuju'
  ])
) as Record<(typeof QUESTION_SCALE_VALUES)[number], string>
