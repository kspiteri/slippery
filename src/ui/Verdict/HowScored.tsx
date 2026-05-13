import { useTranslation } from 'react-i18next'
import type { SlippinessResult } from '../../logic/slipperiness'
import type { TyrePref } from '../../state'

type StudsEffect =
  | { kind: 'flat';   value: number }
  | { kind: 'factor'; value: number }
  | { kind: 'full' }

interface ScoringRule {
  key: string
  maxPoints: number
  capped: boolean
  studs: StudsEffect
}

const SCORING_RULES: ScoringRule[] = [
  { key: 'overnightLow', maxPoints: 30, capped: false, studs: { kind: 'flat',   value: 20  } },
  { key: 'hardFreeze',   maxPoints: 20, capped: false, studs: { kind: 'flat',   value: 15  } },
  { key: 'coldCurrent',  maxPoints: 15, capped: false, studs: { kind: 'flat',   value: 5   } },
  { key: 'blackIce',     maxPoints: 35, capped: false, studs: { kind: 'flat',   value: 25  } },
  { key: 'coldPrecip',   maxPoints: 20, capped: false, studs: { kind: 'flat',   value: 0   } },
  { key: 'snowExtra',    maxPoints: 15, capped: false, studs: { kind: 'flat',   value: 10  } },
  { key: 'sleetExtra',   maxPoints:  8, capped: false, studs: { kind: 'flat',   value: 4   } },
  { key: 'cobble',       maxPoints: 10, capped: true,  studs: { kind: 'flat',   value: 0   } },
  { key: 'rough',        maxPoints:  5, capped: true,  studs: { kind: 'flat',   value: 0   } },
  { key: 'iceSurface',   maxPoints: 30, capped: true,  studs: { kind: 'full'               } },
  { key: 'snowSurface',  maxPoints: 15, capped: true,  studs: { kind: 'factor', value: 0.7 } },
  { key: 'iceAlert',     maxPoints: 25, capped: false, studs: { kind: 'flat',   value: 15  } },
  { key: 'gustModerate', maxPoints: 10, capped: false, studs: { kind: 'flat',   value: 0   } },
  { key: 'gustStrong',   maxPoints: 15, capped: false, studs: { kind: 'flat',   value: 0   } },
]

function formatPoints(maxPoints: number, capped: boolean): string {
  return capped ? `≤+${maxPoints}` : `+${maxPoints}`
}

function studsEffective(rule: ScoringRule): string {
  const { maxPoints, capped, studs } = rule
  const prefix = capped ? '≤' : ''
  if (studs.kind === 'full')   return '+0'
  if (studs.kind === 'factor') return `${prefix}+${maxPoints - Math.round(maxPoints * studs.value)}`
  return `${prefix}+${Math.max(0, maxPoints - studs.value)}`
}

export function HowScored({ result, tyrePref }: { result: SlippinessResult; tyrePref: TyrePref }) {
  const { t } = useTranslation()
  const { breakdown, score, studdedScore } = result
  const showStuds = tyrePref === 'studded'
  const totalForTyre = showStuds ? studdedScore : score

  return (
    <details className="how-scored">
      <summary>{t('howScored.toggle')}</summary>

      <div className="how-scored-current">
        <div className="how-scored-section-label">{t('howScored.current')}</div>
        {breakdown.length === 0 ? (
          <p className="how-scored-empty">{t('howScored.noRules')}</p>
        ) : (
          <table>
            <tbody>
              {breakdown.map((b) => {
                const effective = showStuds ? Math.max(0, b.points - b.studsReduction) : b.points
                return (
                  <tr key={b.ruleKey}>
                    <td>{t(`howScored.rules.${b.ruleKey}`)}</td>
                    <td>+{effective}</td>
                  </tr>
                )
              })}
              <tr className="totals-row">
                <td>{t('howScored.total')}</td>
                <td>{totalForTyre}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <div className="how-scored-reference">
        <div className="how-scored-section-label">{t('howScored.reference')}</div>
        <p className="how-scored-intro">{t('howScored.intro')}</p>
        <table>
          <thead>
            <tr>
              <th>{t('howScored.ruleHeader')}</th>
              <th>{showStuds ? t('howScored.studdedPointsHeader') : t('howScored.pointsHeader')}</th>
            </tr>
          </thead>
          <tbody>
            {SCORING_RULES.map((r) => (
              <tr key={r.key}>
                <td>{t(`howScored.rules.${r.key}`)}</td>
                <td>{showStuds ? studsEffective(r) : formatPoints(r.maxPoints, r.capped)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="footnote">{t('howScored.thresholds')}</p>
      </div>
    </details>
  )
}
