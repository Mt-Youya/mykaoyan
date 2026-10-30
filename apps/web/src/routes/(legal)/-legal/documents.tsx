import { useState } from "react"
import type { ReactNode } from "react"

import { LEGAL_VERSION, MEDIA_DATA_LOCATION, SITE_OPERATOR, SUPPORT_EMAIL } from "@mykaoyan/core"
import { Button, Label } from "@mykaoyan/ui"

import type { PhonePolicy } from "../../(account)/-auth"

const link =
  "inline-flex min-h-11 items-center text-primary underline underline-offset-4 active:opacity-70 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"

export function LegalLinks() {
  return (
    <nav
      aria-label="政策与帮助"
      className="page-container flex flex-wrap gap-x-6 gap-y-1 border-t border-border py-5 text-sm"
    >
      <a className={link} href="/privacy">
        隐私政策
      </a>
      <a className={link} href="/terms">
        用户协议
      </a>
      <a className={link} href="/support#report">
        投诉举报
      </a>
      <a className={link} href="/support#appeal">
        申诉
      </a>
    </nav>
  )
}

function Document({ title, introduction, children }: { title: string; introduction: string; children: ReactNode }) {
  return (
    <main className="page-container py-section">
      <article className="mx-auto flex max-w-prose min-w-0 flex-col gap-7 text-base leading-[1.8] [&_h2]:font-serif [&_h2]:text-xl [&_section]:flex [&_section]:scroll-mt-6 [&_section]:flex-col [&_section]:gap-3">
        <header>
          <a href="/" className={link}>
            返回我的考研
          </a>
          <h1 className="mbs-4 min-w-0 font-serif text-section wrap-break-word">{title}</h1>
          <p className="mbs-3 text-muted-foreground">{introduction}</p>
          <p className="mbs-3 text-sm text-muted-foreground">更新日期：{LEGAL_VERSION}</p>
        </header>
        {children}
      </article>
    </main>
  )
}

export function PrivacyDocument({ databaseRegion = "尚未确认" }: { databaseRegion?: string }) {
  return (
    <Document title="隐私政策" introduction="了解信息用途、存储去向，以及如何行使你的权利。">
      <section id="operator">
        <h2>一、运营者与联系</h2>
        <p>
          本站由{SITE_OPERATOR}个人运营，提供考研课程、讲义与学习工具。个人信息相关问题请联系{" "}
          <a className={link} href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          ，或查看
          <a className={link} href="/support#privacy">
            个人信息权利请求说明
          </a>
          。
        </p>
      </section>
      <section id="information">
        <h2>二、信息与用途</h2>
        <p>
          浏览公开内容无需注册。网站及网络服务商处理传输所需的网络地址、请求和设备信息，用于提供服务、安全防护与排查故障。
        </p>
        <p>
          登录时收集并验证手机号，用于创建和识别账号、防刷与会话管理；保存账号标识、注册时间、会话及必要的
          IP、浏览器信息、同意版本和时间。短信由阿里云号码认证发送与校验，本站不保存验证码原文；频率校验只使用手机号的不可直接还原摘要，不用于营销。
        </p>
        <p>
          云端学习服务保存你主动提交的备考档案、考点进度、错题与复测记录、每日记录、计划、周复盘及进度文件历史，用于呈现和恢复本人的学习状态。会员期、兑换及管理记录用于判断相应权限。
        </p>
        <p>
          社区目前关闭。开放后，评论、回复、投稿视频及其标题、简介、科目、审核结果、评分和操作记录将用于展示、审核、排序与处理争议；上架视频和评论会向访客展示。请勿在内容中放入本人或他人的手机号、证件、住址等私人资料。
        </p>
        <p>
          浏览器中的词表、单词复习、私有题目和答案、私有笔记及其备份由你保管，不随进度文件上传。部分工作台草稿也仅在当前浏览器保存，请以页面提示为准。
        </p>
      </section>
      <section id="transfer">
        <h2>三、存储位置与个人信息出境说明</h2>
        <p>
          <strong>本次运行环境的账号数据库地区：{databaseRegion}。</strong>
          尚未确认时暂停登录。境外接收方的注册地与数据存储地可能不同，请以本次列明的地区为准。
        </p>
        <p>
          在使用境外数据库的环境中，为提供账号和云端服务，手机号、账号与会话信息、学习数据、会员及同意记录，以及启用社区后的评论、投稿元数据、评分与管理记录，会经加密连接保存到列明的境外地区。拒绝该项处理将无法使用依赖云端账号的服务，仍可浏览无需登录的内容和使用适用的浏览器本地工具。
        </p>
        <p>
          数据库受托服务商为 <strong>Supabase Pte. Ltd.</strong>
          （新加坡），数据库与备份按项目所选区域托管；其关联方和受托服务商可能因支持、安全或运维在其他地区处理必要数据，不能保证所有处理均留在所选地区。见
          <a className={link} href="https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq">
            数据地区与传输说明
          </a>
          。境外接收方联系渠道为{" "}
          <a className={link} href="mailto:privacy@supabase.com">
            privacy@supabase.com
          </a>
          ；你可说明涉及本站的信息与请求，申请查阅、更正、删除等，也可由本站协助定位和转交。
        </p>
        <p>
          视频、字幕等媒体文件使用 <strong>Cloudflare, Inc.</strong> 的 R2 存储；最近只读核对的媒体桶位置为{" "}
          <strong>{MEDIA_DATA_LOCATION}</strong>
          ，该查询没有提供具体国家。上传与播放通过其全球网络处理必要的请求、网络地址和访问日志，不代表所有处理仅发生于西欧。可选择不上传或不播放视频；社区关闭期间不接受新的社区投稿。
        </p>
        <p>
          Cloudflare 的境外处理及权利联系程序见
          <a className={link} href="https://www.cloudflare.com/privacypolicy/">
            Cloudflare 隐私政策及联系渠道
          </a>
          。可直接按其程序提出请求，也可联系本站协助定位媒体记录。请勿在公开评论或公共代码仓库提交个人信息权利材料。
        </p>
        <p>
          登录时，出境单独同意与协议确认分开勾选，均不预选。出境同意版本包含数据库地区，处理规则或地区变化后重新登录须确认新版本；不以点击普通浏览链接替代依法需要的单独同意。
        </p>
      </section>
      <section id="providers">
        <h2>四、受托处理与保护</h2>
        <p>
          网站及 API
          运行于境内阿里云服务器，阿里云号码认证处理发送及校验短信所需的手机号。除履行法定义务、取得相应同意或提供上述服务所需的受托处理外，本站不出售个人信息，不将手机号用于广告营销。
        </p>
        <p>
          只有你主动发布且按规则允许展示的内容进入公开社区；审核、投诉和学习数据不作为公开目录展示。本站采用传输加密、会话控制、服务端权限校验及管理操作记录，管理员按必要范围处理信息。发现安全事件后依法采取措施，并在需要时通知。
        </p>
      </section>
      <section id="retention">
        <h2>五、保留与删除</h2>
        <p>
          账号和学习信息在提供账号服务所需期间保留，可导出学习数据并请求注销、删除。会话最长有效期30天，使用时可能续期；可退出当前或全部设备。会员到期不自动删除历史评论、投稿或评分。
        </p>
        <p>
          驳回投稿的原文件满30天后进入清理，失败会重试；必要审核与争议记录不随文件一并删除。经确认的删除、注销请求由运营者人工处理；依法需留存或技术上暂不能删除的信息，将限制使用并说明理由。备份恢复后须继续执行已确认的删除请求。
        </p>
        <p>
          同意、必要安全及争议记录仅在处理目的和法定保存要求所需期间保留，达到目的或期限届满后删除或匿名化。邮件中的材料用于核查、反馈与必要争议记录，处理后按最小必要范围留存，不扩展用途。请勿发送验证码、完整证件或不必要的私人资料。
        </p>
      </section>
      <section id="rights">
        <h2>六、你的权利</h2>
        <p>
          可请求查阅、复制、更正、删除个人信息，注销账号、撤回同意或取得解释。请按
          <a className={link} href="/support#privacy">
            个人信息权利请求
          </a>
          发送邮件，说明请求和站内相关记录；运营者将以必要方式核验账号控制权，不要求在公开渠道提交完整手机号或证件。
        </p>
        <p>
          核验后依法及时处理；需要补充材料、无法立即处理或存在法定例外时说明原因和后续方式。撤回同意不影响撤回前已合法开展处理的效力，但可能使依赖该信息的服务无法继续，建议先导出学习数据。对结果有异议可再次申诉，或向有关主管部门反映。
        </p>
      </section>
      <section id="children">
        <h2>七、未成年人及更新</h2>
        <p>
          本站主要面向考研学习者。未满十四周岁请勿自行注册、投稿或提交个人信息；监护人发现相关信息已提交，可通过上述邮箱联系处理。其他未成年人应在监护人指导下阅读政策与协议。
        </p>
        <p>
          变更将在本页标明日期；涉及处理目的、方式、种类或出境地区等重要变化时，重新告知并依法取得相应同意。本页不表示社区已经开放或外部资质已经取得。
        </p>
      </section>
    </Document>
  )
}

export function TermsDocument() {
  return (
    <Document title="用户协议" introduction="了解服务范围、账号规则、内容发布和争议处理方式。">
      <section>
        <h2>一、服务与运营者</h2>
        <p>
          本协议由你与{SITE_OPERATOR}订立。本站提供免费课程、讲义及适用的学习工具，登录后可使用账号相关功能。请同时阅读
          <a className={link} href="/privacy">
            隐私政策
          </a>
          ，个人信息出境另行单独征得同意。联系渠道为{" "}
          <a className={link} href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          。
        </p>
        <p>
          <strong>社区目前关闭。</strong>
          评论、投稿、评分须满足外部条件并明确开放后才能使用；会员身份不能绕过关闭状态，规则说明不承诺开放日期。
        </p>
      </section>
      <section>
        <h2>二、账号与会员</h2>
        <p>
          请使用本人合法控制的手机号，保管验证码、会话和 Agent
          令牌，不冒用身份、不转借凭据或绕过访问限制。发现异常可退出全部设备并联系运营者。
        </p>
        <p>
          当前不接入支付；会员由管理员手动开通或兑换码获得，每个会员期365天，可叠加。只有当前有效会员可以使用已开放的评论、投稿与评分，到期后不能新增或修改相应内容，历史记录按隐私政策保留。免费浏览不以会员身份为条件。
        </p>
      </section>
      <section>
        <h2>三、内容与使用规则</h2>
        <p>
          请遵守法律法规，不发布违法有害内容、骚扰、欺诈、恶意广告，或侵犯隐私、名誉和知识产权的材料；不得上传真题原文、题图、真题答案或未经授权的第三方内容，不提交证件、考生成绩名单等私人资料。
        </p>
        <p>
          评论只支持一层回复，关键词命中可能拒绝发送；管理员可依规则删除并保留处置记录。投稿须符合格式、大小、时长要求且有权提供，先审核再上架；通过审核不转移投稿人的责任，也不等于平台取得业务许可。评分须基于实际内容，不自评、不刷分、不操纵推荐。
        </p>
      </section>
      <section>
        <h2>四、投稿授权与管理</h2>
        <p>
          你保留自己作品的权利。投稿即在提供本站服务所必要范围内，非独占地授权本站存储、技术处理、审核、展示与传输作品；不包含向无关第三方出售或任意扩展用途。请先确认画面、声音和字幕等涉及的权利均已取得。
        </p>
        <p>
          可通过
          <a className={link} href="/support#appeal">
            申诉入口
          </a>
          申请复核审核结果或下架自己的投稿；侵权线索可通过
          <a className={link} href="/support#report">
            投诉举报入口
          </a>
          提出。下架后停止新的公开展示和播放凭证签发，已签发的短时凭证可能持续到期；必要审核与争议记录按隐私政策保存。
        </p>
      </section>
      <section>
        <h2>五、投诉、处置与申诉</h2>
        <p>
          任何人均可举报违法、不良、侵权或泄露隐私的内容，无需登录或会员身份。请提供站内链接或编号、具体理由和必要且脱敏的线索。运营者人工核查，必要时先暂停展示，依法处理并保留记录，不公开举报人的不必要身份信息。
        </p>
        <p>
          对删除、驳回、下架或账号处置有异议，可说明原记录、处理情况、异议理由和补充材料申请复核。我们会核验记录，说明结论；需补充材料或无法受理时告知原因。账号处置依据事实和规则，视情况提醒、拒绝发布、限制功能或关闭账号，不剥夺依法享有的权利。
        </p>
      </section>
      <section>
        <h2>六、学习数据与服务变化</h2>
        <p>
          请定期导出学习数据和浏览器私有内容备份，妥善保管令牌。本站不保证考试成绩、录取或第三方信息始终准确；招生事项请核对有关机构最新公告，课程与工具不代替本人核验。
        </p>
        <p>
          维护、故障或外部条件变化可能影响服务，我们将尽合理努力恢复并在需要时说明。本协议不排除或限制依法不能免除的责任，不影响依法投诉、申诉或寻求其他救济。注销与个人信息处理按隐私政策办理。
        </p>
      </section>
      <section>
        <h2>七、协议更新与适用</h2>
        <p>
          适用中华人民共和国法律。修改将在本页标明版本，重要规则变化时告知并按需要重新确认，不以继续浏览替代依法需要的同意。争议可先通过公开邮箱协商，协商不成可依法向有管辖权的机构寻求救济。
        </p>
      </section>
    </Document>
  )
}

const requests = [
  {
    id: "report",
    title: "投诉举报",
    subject: "[投诉举报] 内容核查",
    guidance:
      "适用于违法、不良、侵权或泄露隐私的内容。请说明站内链接或编号、问题位置、理由及必要的脱敏线索；版权投诉请说明权利来源与主张。",
    template: "站内链接或记录编号：\n问题位置与理由：\n必要的脱敏线索：\n希望如何处理：",
  },
  {
    id: "appeal",
    title: "申诉",
    subject: "[申诉] 处置复核",
    guidance:
      "适用于删除、驳回、下架或账号处置异议。请说明原记录、已有结论、异议理由和补充材料；没有编号时可提供链接与大致处理时间。",
    template: "原记录链接或编号：\n已有处理与时间：\n异议理由和补充线索：\n希望如何复核：",
  },
  {
    id: "privacy",
    title: "个人信息权利请求",
    subject: "[个人信息] 权利请求",
    guidance:
      "可申请查阅、复制、更正、删除、注销、撤回同意或解释。先说明请求与相关记录，运营者再核验账号控制权；不要直接发送完整手机号、证件或验证码。",
    template: "请求类型：\n相关站内记录：\n希望处理的信息范围：\n说明（请勿填写验证码或完整证件）：",
  },
] as const

export function SupportDocument() {
  const [copyMessage, setCopyMessage] = useState("")
  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL)
      setCopyMessage("邮箱已复制")
    } catch {
      setCopyMessage("复制失败，请选择邮箱地址手动复制")
    }
  }
  return (
    <Document title="投诉举报与申诉" introduction="提出内容核查、处置复核或个人信息权利请求。">
      <section>
        <h2>人工处理渠道</h2>
        <p>
          公开邮箱：
          <a className={link} href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          。无需登录或会员身份，社区关闭期间也可联系。
        </p>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => void copyEmail()}>
          复制邮箱地址
        </Button>
        <p role="status" className="text-sm text-muted-foreground">
          {copyMessage || "也可手动复制邮箱，用你常用的邮箱发送。"}
        </p>
        <p>
          邮件入口会打开草稿，<strong>仍需在邮箱中发送</strong>。本站不会因点击入口自动收件，也不会自动生成受理编号。
        </p>
      </section>
      {requests.map((item) => (
        <section id={item.id} key={item.id}>
          <h2>{item.title}</h2>
          <p>{item.guidance}</p>
          <a
            className={link}
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(item.subject)}&body=${encodeURIComponent(item.template)}`}
          >
            通过邮件提出{item.title}
          </a>
        </section>
      ))}
      <section>
        <h2>核查与反馈</h2>
        <p>
          运营者收件后人工核查，必要时请你补充材料，通过原邮件线程反馈结论或无法处理的原因。仍有异议可回复原邮件申请复核，法定救济渠道不受影响。持续暴露隐私或明显违法内容可在主题中说明紧急情况。
        </p>
        <p>
          只提交处理所必需的材料，不在公开评论或公共代码仓库贴私人资料。材料仅用于核验、反馈及必要争议记录，详见
          <a className={link} href="/privacy#rights">
            隐私政策
          </a>
          。
        </p>
      </section>
    </Document>
  )
}

export function PolicyChecks({
  policy,
  agreed,
  consented,
  onAgreement,
  onConsent,
}: {
  policy: PhonePolicy
  agreed: boolean
  consented: boolean
  onAgreement: (value: boolean) => void
  onConsent: (value: boolean) => void
}) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mbs-2 text-base">登录前请分别确认</legend>
      <Label className="items-start gap-3 leading-relaxed">
        <input
          type="checkbox"
          name="terms-consent"
          className="mbs-1 size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-ring active:opacity-70 disabled:opacity-50"
          disabled={!policy.loginEnabled}
          checked={agreed}
          onChange={(event) => onAgreement(event.target.checked)}
          required
        />
        <span>
          我已阅读并同意
          <a className={link} href="/terms">
            用户协议
          </a>
          和
          <a className={link} href="/privacy">
            隐私政策
          </a>
          （版本 {policy.termsVersion}）。
        </span>
      </Label>
      <Label className="items-start gap-3 leading-relaxed">
        <input
          type="checkbox"
          name="personal-info-transfer-consent"
          className="mbs-1 size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-ring active:opacity-70 disabled:opacity-50"
          disabled={!policy.loginEnabled}
          checked={consented}
          onChange={(event) => onConsent(event.target.checked)}
          required
        />
        <span>
          我单独同意依
          <a className={link} href="/privacy#transfer">
            个人信息出境说明
          </a>
          ，将手机号、账号与会话信息、学习数据及相关服务记录存储于 {policy.databaseRegion}{" "}
          的数据库，用于账号和云端服务（出境同意版本 {policy.privacyPolicyVersion}）。拒绝后仍可浏览无需登录的内容。
        </span>
      </Label>
    </fieldset>
  )
}
