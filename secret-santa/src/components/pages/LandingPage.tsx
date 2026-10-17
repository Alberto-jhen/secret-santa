import { Link } from 'react-router-dom'
import { useTranslation } from '../../i18n/useTranslation'
import { ButtonLink } from '../ui/ButtonLink'
import { Icon } from '../ui/Icon'
import { PageContainer } from '../ui/PageContainer'
const steps = [
  {
    number: '01',
    icon: 'users',
    titleKey: 'stepOneTitle',
    descriptionKey: 'stepOneDescription',
  },
  {
    number: '02',
    icon: 'mail',
    titleKey: 'stepTwoTitle',
    descriptionKey: 'stepTwoDescription',
  },
  {
    number: '03',
    icon: 'sparkles',
    titleKey: 'stepThreeTitle',
    descriptionKey: 'stepThreeDescription',
  },
] as const

export function LandingPage() {
  const { t } = useTranslation()
  const promises = [
    t('promiseNoPaper'),
    t('promisePrivate'),
    t('promiseSimple'),
  ]
  return (
    <>
      <section className="relative overflow-hidden py-[72px] pb-[60px] max-[980px]:pt-12 max-[720px]:py-[53px] max-[720px]:pb-[30px]">
        <PageContainer className="grid min-h-[520px] grid-cols-[minmax(0,1fr)_minmax(400px,0.9fr)] items-center gap-[54px] max-[980px]:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)] max-[980px]:gap-5 max-[720px]:flex max-[720px]:min-h-0 max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:gap-2.5">
          <div className="relative z-10 py-3 pb-7 max-[720px]:pb-0">
            <p className="mb-[19px] flex items-center gap-[9px] text-[10px] font-bold tracking-[0.15em] text-forest uppercase">
              <span className="size-[7px] rounded-full bg-coral shadow-[0_0_0_4px_rgba(226,126,101,0.12)]" />
              {t('heroEyebrow')}
            </p>
            <h1 className="m-0 max-w-[650px] font-display text-[clamp(48px,5.3vw,72px)] leading-[0.99] font-medium tracking-[-0.055em] text-ink max-[980px]:text-[clamp(46px,6vw,60px)] max-[720px]:text-[clamp(46px,12vw,65px)] max-[420px]:text-[45px]">
              {t('heroTitleLead')}
              <span className="block text-forest italic">
                {t('heroTitleEmphasis')}
              </span>
            </h1>
            <p className="mt-[23px] max-w-[500px] text-[15px] leading-[1.8] text-muted-foreground max-[720px]:mt-[18px] max-[720px]:text-sm">
              {t('heroDescription')}
            </p>
            <div className="mt-[29px] flex flex-wrap items-center gap-2 max-[720px]:mt-[22px] max-[420px]:flex-col max-[420px]:items-stretch">
              <ButtonLink arrow="right" to="/guest-draw">
                {t('organizeDraw')}
              </ButtonLink>
              <a
                className="inline-flex min-h-[52px] items-center justify-center rounded-full px-[22px] text-[13px] font-semibold text-ink no-underline transition hover:bg-forest/5 hover:text-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral max-[420px]:w-full"
                href="#how-it-works"
              >
                {t('learnHow')}
              </a>
            </div>
            <div className="mt-[27px] flex flex-wrap gap-x-[23px] gap-y-4 max-[720px]:mt-[19px]">
              {promises.map((promise) => (
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#68776e]"
                  key={promise}
                >
                  <Icon className="size-[14px] text-forest" name="check" />
                  {promise}
                </span>
              ))}
            </div>
          </div>

          <div
            aria-label={t('illustrationLabel')}
            className="relative isolate grid min-h-[520px] place-items-center max-[980px]:min-h-[440px] max-[980px]:scale-90 max-[720px]:mt-0 max-[720px]:mb-0 max-[720px]:min-h-[420px] max-[720px]:w-full max-[720px]:scale-90 max-[420px]:-mb-[65px] max-[420px]:min-h-[360px] max-[420px]:scale-[0.77] max-[420px]:origin-top"
            role="img"
          >
            <div className="absolute aspect-square w-full max-w-[510px] rounded-full border border-forest/10 bg-[radial-gradient(circle_at_center,rgba(220,237,160,0.38),rgba(220,237,160,0.09)_56%,transparent_70%)] before:absolute before:inset-[8%] before:rounded-full before:border before:border-dashed before:border-forest/10 before:content-[''] after:absolute after:inset-[18%] after:rounded-full after:border after:border-forest/10 after:content-['']" />
            <div className="absolute top-[9%] right-[8%] size-[77px] rounded-full border border-coral/20 bg-coral/10" />
            <div className="absolute top-[27%] right-[15%] z-10 text-coral">
              <Icon className="size-[30px] stroke-[1.35]" name="sparkles" />
            </div>
            <div className="absolute bottom-[18%] left-[12%] z-10 scale-[0.7] text-coral">
              <Icon className="size-[30px] stroke-[1.35]" name="sparkles" />
            </div>

            <div className="relative z-10 mt-[46px] h-[245px] w-[230px] animate-gift-float [filter:drop-shadow(0_24px_22px_rgba(58,60,39,0.17))] motion-reduce:animate-none">
              <div className="absolute top-[2px] left-1/2 z-30 h-[63px] w-[92px] -translate-x-1/2">
                <span className="absolute top-1 left-px h-[37px] w-12 rotate-[32deg] rounded-[50%_50%_12px_50%] border-[10px] border-coral" />
                <span className="absolute top-1 right-px h-[37px] w-12 -scale-x-100 rotate-[32deg] rounded-[50%_50%_12px_50%] border-[10px] border-coral" />
              </div>
              <div className="absolute inset-x-0 top-[68px] bottom-0 overflow-hidden rounded-[5px_5px_18px_18px] border border-ink/10 bg-[linear-gradient(110deg,#d8a85f,#efd48a_50%,#cf9850)]">
                <span className="absolute inset-y-0 left-[45px] w-7 bg-[#f3e1a8]" />
                <span className="absolute inset-y-0 right-[45px] w-7 bg-[#f3e1a8]/50" />
                <span className="absolute inset-y-0 left-1/2 z-10 w-10 -translate-x-1/2 bg-[#f7ebc4] shadow-[inset_4px_0_rgba(255,255,255,0.24)]" />
                <span className="absolute right-[13px] bottom-4 z-20 rotate-[-5deg] rounded bg-[#fff8dd] px-[9px] py-1 font-display text-[13px] italic text-[#6d5330]">
                  {t('giftTag')}
                </span>
              </div>
              <div className="absolute top-[52px] left-[-15px] z-20 h-[43px] w-[260px] rounded-[9px] border border-ink/10 bg-[linear-gradient(110deg,#e8c777,#f5dfa0_50%,#dbb663)]">
                <span className="absolute inset-y-0 left-1/2 w-10 -translate-x-1/2 bg-[#f7ebc4]" />
              </div>
            </div>

            <div className="absolute top-[14%] left-[1%] z-20 w-[218px] rotate-[-4deg] rounded-[14px] border border-ink/10 bg-paper/95 p-[15px] shadow-[0_16px_40px_rgba(35,53,42,0.1)] backdrop-blur">
              <div className="flex items-center justify-between">
                <span className="grid size-[31px] place-items-center rounded-[10px] bg-[#edf3d9] text-forest">
                  <Icon className="size-[17px]" name="gift" />
                </span>
                <span className="rounded-full bg-[#eff5e4] px-[7px] py-1 text-[8px] font-bold text-[#547346]">
                  {t('drawReady')}
                </span>
              </div>
              <p className="my-[13px] font-display text-base font-semibold text-ink">
                {t('drawTitle')}
              </p>
              <div className="flex items-center border-t border-[#edf0e9] pt-[11px]">
                <span className="mr-[-5px] grid size-6 place-items-center rounded-full border-2 border-paper bg-[#f5d1bd] text-[8px] font-bold text-forest-dark">
                  A
                </span>
                <span className="mr-[-5px] grid size-6 place-items-center rounded-full border-2 border-paper bg-[#dbe8b7] text-[8px] font-bold text-forest-dark">
                  M
                </span>
                <span className="mr-[-5px] grid size-6 place-items-center rounded-full border-2 border-paper bg-[#d2dce7] text-[8px] font-bold text-forest-dark">
                  L
                </span>
                <span className="mr-[-5px] grid size-6 place-items-center rounded-full border-2 border-paper bg-[#eff0e8] text-[8px] font-bold text-[#637168]">
                  +3
                </span>
                <span className="ml-[11px] text-[8px] text-[#7a867e]">
                  {t('participants')}
                </span>
              </div>
            </div>

            <div className="absolute right-0 bottom-[17%] z-20 flex rotate-[3deg] items-center gap-2.5 rounded-[14px] border border-ink/10 bg-paper/95 p-3 shadow-[0_16px_40px_rgba(35,53,42,0.1)] backdrop-blur max-[420px]:right-[-6%]">
              <span className="grid size-[35px] place-items-center rounded-full bg-[#f4d7c6] font-display text-[17px] text-[#7c473b]">
                L
              </span>
              <span>
                <strong className="block text-[9px] text-ink">
                  {t('secretPerson')}
                </strong>
                <small className="mt-[3px] block text-[8px] text-[#829087]">
                  {t('revealsSoon')}
                </small>
              </span>
              <span className="ml-[5px] grid size-[27px] place-items-center rounded-lg bg-[#edf3d9] text-forest">
                <Icon className="size-[15px]" name="shield" />
              </span>
            </div>
            <span className="absolute right-[19%] bottom-[5%] font-display text-[13px] italic text-[#7e8a80] max-[420px]:right-[12%] max-[420px]:bottom-[1%]">
              {t('artCaption')}
            </span>
          </div>
        </PageContainer>
        <div className="absolute right-0 bottom-0 left-0 h-px bg-gradient-to-r from-transparent via-[#e4e6dc] to-transparent" />
      </section>

      <section className="py-[105px] max-[720px]:py-[76px]" id="how-it-works">
        <PageContainer>
          <div className="mx-auto mb-12 max-w-[600px] text-center max-[720px]:mb-8">
            <p className="mb-[19px] flex items-center justify-center gap-[9px] text-[10px] font-bold tracking-[0.15em] text-forest uppercase">
              {t('stepsEyebrow')}
            </p>
            <h2 className="m-0 font-display text-[clamp(34px,4vw,48px)] leading-[1.1] font-medium tracking-[-0.045em] text-ink">
              {t('stepsTitle')}
            </h2>
            <p className="mx-auto mt-[14px] max-w-[470px] text-sm leading-[1.75] text-muted-foreground">
              {t('stepsDescription')}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-[17px] max-[720px]:grid-cols-1 max-[720px]:gap-[11px]">
            {steps.map((step) => (
              <article
                className="min-h-[225px] rounded-[15px] border border-line bg-paper/70 p-[25px] transition duration-200 hover:-translate-y-1 hover:border-[#cbd7c3] hover:shadow-[0_16px_34px_rgba(24,53,44,0.07)] max-[720px]:min-h-0 max-[720px]:p-5"
                key={step.number}
              >
                <div className="mb-7 flex items-center justify-between max-[720px]:mb-[18px]">
                  <span className="grid size-[43px] place-items-center rounded-[13px] bg-[#eaf0de] text-forest">
                    <Icon className="size-[21px]" name={step.icon} />
                  </span>
                  <span className="font-display text-[15px] text-[#b2bcb2]">
                    {step.number}
                  </span>
                </div>
                <h3 className="mb-2 font-display text-[21px] font-semibold tracking-[-0.025em] text-ink">
                  {t(step.titleKey)}
                </h3>
                <p className="max-w-[290px] text-xs leading-[1.7] text-muted-foreground">
                  {t(step.descriptionKey)}
                </p>
              </article>
            ))}
          </div>
        </PageContainer>
      </section>

      <section
        className="border-y border-ink/10 bg-[#f0f1e8] py-[105px] max-[720px]:py-[76px]"
        id="benefits"
      >
        <PageContainer className="grid grid-cols-[0.95fr_1fr] items-center gap-24 max-[980px]:gap-12 max-[720px]:grid-cols-1 max-[720px]:gap-9">
          <div
            aria-hidden="true"
            className="relative grid min-h-[360px] place-items-center overflow-hidden rounded-[20px] bg-[#e8ecdd] max-[720px]:min-h-[305px]"
          >
            <div className="absolute size-[270px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(255,254,250,0.85),transparent_70%)]" />
            <div className="relative min-h-[252px] w-[242px] rotate-[-5deg] rounded-[9px] border border-ink/10 bg-paper p-[23px] shadow-[0_20px_38px_rgba(24,53,44,0.12)] max-[720px]:scale-90">
              <div className="flex items-center gap-[9px] font-display text-[13px] italic text-ink">
                <span className="grid size-[30px] place-items-center rounded-[9px] bg-lime text-forest">
                  <Icon className="size-4" name="gift" />
                </span>
                {t('rulesTitle')}
              </div>
              <div className="mt-[17px] h-[5px] w-[88%] rounded-full bg-[#eff0e9]" />
              <div className="mt-2 h-[5px] w-[60%] rounded-full bg-[#eff0e9]" />
              {[1, 2, 3].map((item) => (
                <div className="mt-4 flex items-center gap-[9px]" key={item}>
                  <span className="grid size-[19px] place-items-center rounded-md bg-[#edf2df] text-forest">
                    <Icon className="size-[13px]" name="check" />
                  </span>
                  <i className="h-[5px] w-[66%] rounded-full bg-[#eff0e9]" />
                </div>
              ))}
            </div>
            <div className="absolute right-[13%] bottom-[16%] flex size-[94px] rotate-[9deg] flex-col items-center justify-center rounded-full border border-paper/50 bg-forest text-paper shadow-[0_12px_24px_rgba(23,75,58,0.2)]">
              <Icon className="size-[26px]" name="shield" />
              <span className="mt-px font-display text-[13px] italic">
                shhh...
              </span>
            </div>
          </div>
          <div>
            <p className="mb-4 flex items-center gap-[9px] text-[10px] font-bold tracking-[0.15em] text-forest uppercase">
              {t('benefitsEyebrow')}
            </p>
            <h2 className="m-0 max-w-[470px] font-display text-[clamp(35px,4vw,48px)] leading-[1.1] font-medium tracking-[-0.045em] text-ink">
              {t('benefitsTitle')}
            </h2>
            <p className="mt-[18px] max-w-[500px] text-[13px] leading-[1.8] text-muted-foreground">
              {t('benefitsDescription')}
            </p>
            <ul className="mt-[23px] grid list-none gap-[13px] p-0">
              {[
                t('benefitOne'),
                t('benefitTwo'),
                t('benefitThree'),
              ].map((benefit) => (
                <li
                  className="flex items-center gap-2.5 text-xs font-medium text-[#42584c]"
                  key={benefit}
                >
                  <span className="grid size-[21px] place-items-center rounded-full bg-[#dde9c6] text-forest">
                    <Icon className="size-[13px]" name="check" />
                  </span>
                  {benefit}
                </li>
              ))}
            </ul>
            <Link
              className="mt-[26px] inline-flex items-center gap-[9px] text-xs font-bold text-forest no-underline hover:underline hover:underline-offset-4"
              to="/register"
            >
              {t('benefitsCta')}
              <Icon className="size-[17px]" name="arrow-right" />
            </Link>
          </div>
        </PageContainer>
      </section>

      <section className="py-[95px] max-[720px]:py-[65px]">
        <PageContainer>
          <div className="relative flex flex-col items-center overflow-hidden rounded-[20px] bg-forest-dark px-8 py-[72px] text-center text-paper max-[720px]:px-5 max-[720px]:py-[58px]">
            <div className="absolute top-[-170px] left-[-90px] size-[260px] rounded-full border border-paper/10" />
            <div className="absolute right-[-120px] bottom-[-180px] size-[340px] rounded-full border border-paper/10" />
            <div className="absolute top-7 right-[18%] text-lime max-[720px]:right-[9%]">
              <Icon className="size-[33px] stroke-[1.4]" name="sparkles" />
            </div>
            <p className="mb-[19px] flex items-center gap-[9px] text-[10px] font-bold tracking-[0.15em] text-[#c5d995] uppercase">
              {t('closingEyebrow')}
            </p>
            <h2 className="relative max-w-[570px] font-display text-[clamp(35px,4.5vw,53px)] leading-[1.1] font-medium tracking-[-0.045em] text-paper max-[420px]:text-4xl">
              {t('closingTitle')}
            </h2>
            <p className="relative mt-[15px] mb-[25px] text-[13px] leading-[1.7] text-[#c2cec2]">
              {t('closingDescription')}
            </p>
            <ButtonLink arrow="right" to="/register" variant="light">
              {t('closingCta')}
            </ButtonLink>
          </div>
        </PageContainer>
      </section>
    </>
  )
}