/**
 * 智慧校园全场景方案彩页生成脚本（用户思维版）
 * 面向中国公立小学/初中教育界人士（教师、中层、校长）
 * 结构：角色视角驱动，场景故事开头，对比表+FAQ
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageBreak } from 'docx';
import * as fs from 'fs';

// 配色主题（IT企业宣传册风格）
const colors = {
  primary: '1e40af',
  secondary: '3b82f6',
  accent: 'f59e0b',
  light: 'dbeafe',
  dark: '1e293b',
  gray: '64748b',
  white: 'ffffff'
};

const FONT = '微软雅黑';

// ============ 工具函数 ============

function createCoverPage() {
  return [
    new Paragraph({ spacing: { before: 1200 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [new TextRun({ text: '智慧校园全场景解决方案', size: 72, bold: true, color: colors.primary, font: FONT })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: '让每一堂课有迹可循 · 让每一份关爱被看见 · 让每一个决策有数据', size: 28, color: colors.secondary, font: FONT })]
    }),
    new Paragraph({ spacing: { before: 800 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: '面向公立小学 / 初中学校', size: 26, color: colors.gray, font: FONT })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
      children: [new TextRun({ text: '2026年版', size: 24, color: colors.gray, font: FONT })]
    }),
    new Paragraph({ children: [new PageBreak()] })
  ];
}

function createChapterTitle(chapterNum, title, subtitle) {
  return [
    new Paragraph({ spacing: { before: 600 }, children: [] }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: chapterNum, size: 28, color: colors.secondary, font: FONT })]
    }),
    new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: title, size: 52, bold: true, color: colors.primary, font: FONT })]
    }),
    new Paragraph({
      spacing: { after: 400 },
      children: [new TextRun({ text: subtitle, size: 24, color: colors.gray, font: FONT, italics: true })]
    }),
    new Paragraph({ children: [new PageBreak()] })
  ];
}

function createContentPage(title, content) {
  const children = [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400, after: 300 },
      children: [new TextRun({ text: title, size: 36, bold: true, color: colors.primary, font: FONT })]
    })
  ];

  content.forEach(item => {
    if (item.type === 'paragraph') {
      children.push(new Paragraph({
        spacing: { before: 200, after: 200 },
        children: [new TextRun({ text: item.text, size: 22, color: colors.dark, font: FONT })]
      }));
    } else if (item.type === 'bullet') {
      children.push(new Paragraph({
        spacing: { before: 120, after: 120 },
        bullet: { level: 0 },
        children: [new TextRun({ text: item.text, size: 22, color: colors.dark, font: FONT })]
      }));
    } else if (item.type === 'highlight') {
      children.push(new Paragraph({
        spacing: { before: 240, after: 240 },
        shading: { type: ShadingType.CLEAR, fill: colors.light },
        indent: { left: 200, right: 200 },
        children: [new TextRun({ text: item.text, size: 22, bold: true, color: colors.primary, font: FONT })]
      }));
    } else if (item.type === 'quote') {
      children.push(new Paragraph({
        spacing: { before: 240, after: 240 },
        indent: { left: 400 },
        border: { left: { style: BorderStyle.SINGLE, size: 6, color: colors.secondary } },
        children: [new TextRun({ text: item.text, size: 22, color: colors.gray, font: FONT, italics: true })]
      }));
    }
  });

  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

function createTablePage(title, headers, rows) {
  const children = [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400, after: 300 },
      children: [new TextRun({ text: title, size: 36, bold: true, color: colors.primary, font: FONT })]
    })
  ];

  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: headers.map(header =>
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: colors.primary },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: header, size: 20, bold: true, color: colors.white, font: FONT })]
          })]
        })
      )
    })
  ];

  rows.forEach((row, index) => {
    tableRows.push(new TableRow({
      children: row.map(cell =>
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: index % 2 === 0 ? colors.white : colors.light },
          children: [new Paragraph({
            spacing: { before: 60, after: 60 },
            children: [new TextRun({ text: cell, size: 20, color: colors.dark, font: FONT })]
          })]
        })
      )
    }));
  });

  children.push(new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE }
  }));

  children.push(new Paragraph({ children: [new PageBreak()] }));
  return children;
}

// ============ 文档内容 ============

async function generateDocument() {
  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
      },
      children: [
        // ===== 封面 =====
        ...createCoverPage(),

        // ===== 第一章：致校长的一封信 =====
        ...createChapterTitle('第一章', '致校长的一封信', '这套系统能帮你回答哪五个问题'),

        ...createContentPage('尊敬的校长', [
          { type: 'paragraph', text: '您好。' },
          { type: 'paragraph', text: '我知道您每天面对什么。周一例会布置了五项工作，到周五想知道谁完成了、卡在哪了，只能挨个问人。上级来文要求全员知晓，您问"都看了吗"，得到的回答永远是"差不多都看了"。学期末教师考核，分数怎么来的、经不经得起质疑，您心里没底。' },
          { type: 'paragraph', text: '这套系统不增加教师的工作量——恰恰相反，它是帮您的老师们把"重复劳动"变成"手机点两下"的工具。它做的只有一件事：让学校管理的每一个动作，从"靠人记"变成"靠系统"。' },
          { type: 'highlight', text: '它帮您回答五个问题：' },
          { type: 'bullet', text: '问题一：布置的工作到底落实了没有？——谁在推进、卡在谁手上、被什么阻滞，一屏看清。' },
          { type: 'bullet', text: '问题二：上级来文老师们都看了吗？——已读171人、未读15人，名单清清楚楚。' },
          { type: 'bullet', text: '问题三：今天有多少学生没来？为什么没来？——每一例缺勤都有原因、有请假、有人跟到底。' },
          { type: 'bullet', text: '问题四：食堂的饭菜质量和价格，家长看得到吗？——每天公示、每周公示，留痕可查。' },
          { type: 'bullet', text: '问题五：教师考核的分数，经得起质疑吗？——每一分都有据可查，自评考评双轨留痕。' },
          { type: 'paragraph', text: '以下章节，分别用一位教师、一位中层主任、一位校长的视角，展示这套系统如何融入学校的一天、一周。请您审阅。' }
        ]),

        ...createContentPage('这套系统不做什么', [
          { type: 'paragraph', text: '我们深知学校不缺"又多一个系统"，缺的是"真正减轻负担的系统"。所以，明确告诉您我们不做什么：' },
          { type: 'bullet', text: '不要求教师额外下载任何软件——全部功能在钉钉里，打开就能用' },
          { type: 'bullet', text: '不增加教师的重复录入——同一个信息只填一次，后续自动流转' },
          { type: 'bullet', text: '不做华而不实的大屏——每个页面都是"打开就能办事"，不是"看着好看"' },
          { type: 'bullet', text: '不搞复杂培训——班主任晨检全程无需打字，只需勾选' },
          { type: 'bullet', text: '不碰资金流——餐费收缴、财务结算不在范围内' },
          { type: 'bullet', text: '不替教师做判断——系统只做记录和提醒，决定权始终在人' },
          { type: 'highlight', text: '一句话：不是给学校加系统，是替学校减负担。' }
        ]),

        ...createContentPage('上线需要多久', [
          { type: 'paragraph', text: '很多校长问：上线会不会折腾一学期？不会。' },
          { type: 'bullet', text: '第1周：基础数据导入（班级、教师名单、校区信息），一次搞定' },
          { type: 'bullet', text: '第2周：核心场景上线（课表、请假、公文），教师开始使用' },
          { type: 'bullet', text: '第3周：扩展场景上线（学生关爱、晨午检、用餐管理）' },
          { type: 'bullet', text: '第4周：全面推广，收集反馈，微调优化' },
          { type: 'paragraph', text: '教师不需要专门培训。所有操作都是"在钉钉里点两下"——教师本来就用钉钉打卡、开会，这是顺手的事。' },
          { type: 'highlight', text: '一个月内全校用起来。不需要买服务器，不需要装软件，不需要额外预算。' }
        ]),

        // ===== 第二章：张老师的周一 =====
        ...createChapterTitle('第二章', '张老师的周一', '一位班主任的一天，从晨检到值班'),

        ...createContentPage('早上 7:40 —— 晨检五分钟', [
          { type: 'paragraph', text: '张老师是三年级二班的班主任。每天早上到班后，第一件事是晨检。' },
          { type: 'paragraph', text: '以前怎么做：翻开纸质晨检表，逐个喊名字，在纸上打勾。发现两个学生没来，要另外打电话问家长，再填一张请假条，再抄到缺勤登记表上。同样的事，写两到三遍。' },
          { type: 'paragraph', text: '现在怎么做：打开手机上的晨检页面，全班45人的名单已经自动列好。两个学生没来——张老师在名字旁边点一下"异常"，选一下原因（发热/事假/其他）。提交。' },
          { type: 'highlight', text: '应到45人、实到43人、缺勤2人——系统自动算好，不用张老师数。' },
          { type: 'paragraph', text: '更关键的是：被标记"异常"的学生，系统自动生成一条请假记录。张老师不需要另外填请假条。而昨天已经请过假的那个学生，系统自动把请假信息填好并锁定——张老师不用改、也不能改，避免重复登记。' },
          { type: 'quote', text: '一次操作，同时完成了健康登记、缺勤登记、请假发起三件事。以前要写三遍，现在写一遍。' }
        ]),

        ...createContentPage('上午 9:00 —— 调课通知来了', [
          { type: 'paragraph', text: '张老师的第三节课被数学组的赵老师调了——赵老师要去区里参加教研，请张老师代一节课。' },
          { type: 'paragraph', text: '以前怎么做：赵老师在微信群里喊一句"张老师帮我代第三节课"。张老师看到了，回个"好的"。但到了月底算课时的时候，谁代了谁的课，已经说不清了。教导处翻遍群聊记录也对不上。' },
          { type: 'paragraph', text: '现在怎么做：赵老师在手机上发起"代课申请"，选好是哪节课、请谁代。教导处审批通过后，课表自动更新——全校任何人打开课表，都能看到这节课已经换成了张老师。' },
          { type: 'highlight', text: '每一次调代课都有记录：谁发起的、谁批准的、什么时间、哪节课。月底算课时，不再靠回忆。' },
          { type: 'paragraph', text: '张老师收到的不是微信群里的一条消息，而是一个正式的待办通知——点一下"确认"就完事了。不需要跑教导处签字，不需要找人代签。' }
        ]),

        ...createContentPage('上午 10:30 —— 请2小时假去银行', [
          { type: 'paragraph', text: '张老师下午要去银行办房贷面签，大概需要2小时。' },
          { type: 'paragraph', text: '以前怎么做：写请假条，找年级组长签字。"你这个月还剩多少弹性假？""好像是还有两次吧，我记不太清了。"年级组长翻翻本子，也不确定。' },
          { type: 'paragraph', text: '现在怎么做：张老师打开请假页面，选"弹性假"。页面立刻显示："本月剩余次数2次，剩余时长95分钟。"' },
          { type: 'paragraph', text: '张老师选择开始时间（下午1点）和结束时间（下午3点），系统自动算出120分钟。提交。年级组长手机上收到审批通知，点一下"同意"。' },
          { type: 'highlight', text: '不用写纸条、不用跑腿签字、不用猜额度还剩多少。手机上30秒搞定。' },
          { type: 'paragraph', text: '月底的时候，办公室主任不需要翻纸条统计——系统自动汇总每位教师的请假次数和时长，一键导出表格交人事。' }
        ]),

        ...createContentPage('下午 2:00 —— 公文到了', [
          { type: 'paragraph', text: '学校办公室发了一份文件：《关于开展师德师风专项整治的通知》，要求全体教师下周三前阅读并知晓。' },
          { type: 'paragraph', text: '以前怎么做：办公室把文件转发到五六个微信群里。张老师刷到了，看了一眼。但办公室不知道谁看了、谁没看。下周三到了，只能打电话逐个问："那个通知你看了吗？"' },
          { type: 'paragraph', text: '现在怎么做：张老师在手机上收到通知，点开文件，看完了。就这一个动作——"点开看"——系统自动记录：张三，2026年8月5日14:03，已阅读。' },
          { type: 'highlight', text: '办公室打开"已读分析"：186人中已读171人，未读15人。名单清清楚楚，不用再打电话问。' },
          { type: 'paragraph', text: '对张老师来说，就是"手机上点一下文件"这么简单。对办公室来说，再也不用"群里喊、电话催、逐个问"了。' }
        ]),

        ...createContentPage('下午 4:00 —— 点餐和值班', [
          { type: 'paragraph', text: '放学前的最后两件事：点明天的午餐，看看这周的值班安排。' },
          { type: 'paragraph', text: '点餐：打开用餐页面，页面上已经显示好"用餐人：张某某""日期：8月6日"。张老师什么都不用填，点一下"提交"。完成。整个过程3秒。' },
          { type: 'paragraph', text: '值班：打开值班看板，本周的安排一目了然——周三晚班、大门岗。如果这周有事需要换班，发起一个换班申请，对方手机上确认签名，系统自动更新排班表。不用私下协商，不用怕"说好了又反悔"。' },
          { type: 'highlight', text: '教师的一天，从早到晚，所有"跑腿签字"的事，都变成了"手机上点两下"。' }
        ]),

        ...createTablePage('张老师的对比表：以前怎么做 vs 现在怎么做', ['日常事务', '以前', '现在', '省了什么'], [
          ['晨检填报', '纸质表格手写，缺勤另填请假条', '手机勾选，缺勤自动生成请假', '少写两遍'],
          ['调代课', '微信群喊话，月底对不上账', '手机发起申请，审批后课表自动更新', '不用跑腿签字'],
          ['请短假', '写纸条找组长签字，额度靠记忆', '手机30秒提交，剩余额度实时显示', '不用跑腿'],
          ['收公文', '群里转发，不知道看没看', '点开即已读，未读名单自动出', '不用电话催'],
          ['点餐', '口头报备或纸质登记', '手机一步提交，3秒完成', '不用开口'],
          ['换班', '私下协商，容易反悔出纠纷', '双方电子签名确认，系统自动改排班', '不怕反悔']
        ]),

        ...createContentPage('教师最关心的五个问题', [
          { type: 'paragraph', text: '我们走访了多所学校，教师最常问的就是这五个问题：' },
          { type: 'bullet', text: '问题1：要不要装新软件？——不用。全部在钉钉里，您本来就在用的那个钉钉。' },
          { type: 'bullet', text: '问题2：会不会增加工作量？——不会。以前要写纸质表、跑签字、打电话催，现在手机上点两下。同一件事，操作更少了。' },
          { type: 'bullet', text: '问题3：手机能用吗？——所有功能都是手机优先设计的。晨检、请假、点餐、换班，全部在手机上完成。' },
          { type: 'bullet', text: '问题4：我的数据会不会被别人看到？——不会。您只能看到自己负责范围内的数据。心理数据只有心理教师能看，考核数据只有管理层能看。' },
          { type: 'bullet', text: '问题5：如果我操作错了怎么办？——关键操作都有确认提示；流程提交后走审批，不会直接生效；误操作可以联系管理员修正。' }
        ]),

        ...createContentPage('郑老师的体育课：点名不再靠一个人', [
          { type: 'paragraph', text: '郑老师是体育教师，带三个班的体育课。体育课在操场上，点名一直是个"单人活"。' },
          { type: 'paragraph', text: '以前怎么做：郑老师点名，45个学生到了43个。那2个没来的，是真的请假了，还是悄悄溜了？郑老师不知道——因为学生可能跟班主任请了假，但没人告诉郑老师。最怕的情况是：学生既没请假、也没来操场，而没有任何人发现。' },
          { type: 'paragraph', text: '现在怎么做：两条线同时走。班主任那边，哪个学生请了假，在手机上标注一下。郑老师这边，照常点名，谁到了勾谁。两边各填各的，互相看不到对方填了什么。' },
          { type: 'paragraph', text: '填完之后，系统自动比对两边的结果："请了假、没来"——正常，班主任知道。"没请假、来了"——正常，人在就好。"请了假、却来了"——正常，人在就安全。唯独"没请假、也没来"——系统立刻标红，进入异常名单。' },
          { type: 'highlight', text: '那个"谁都没发现"的学生，当天就会被发现。这就是体育课上最需要的安全网。' },
          { type: 'quote', text: '两个大人各报各的，系统自动比对——比任何一个人单独点名都可靠。' }
        ]),

        ...createContentPage('一次传染病事件的完整记录', [
          { type: 'paragraph', text: '假设班里有个学生确诊了腮腺炎。这件事在系统里是这样走的：' },
          { type: 'bullet', text: '第1天 早上：晨检时，班主任发现该学生没来，标注"异常-传染病"，选择"流行性腮腺炎"。提交的同时，系统自动生成一条请假记录。' },
          { type: 'bullet', text: '第2天到第7天：每天的晨检，系统自动把这个学生的请假信息填好并锁定——班主任不用每天重复填，也不会漏填。' },
          { type: 'bullet', text: '第8天：学生病愈返校。班主任办理销假。因为请假原因里含"传染病"三个字，系统强制要求上传医院复课证明——没有证明，销不了假。' },
          { type: 'bullet', text: '全程：从发现到复课，每一天的记录、每一份材料，都在系统里。疾控中心要查，随时可以调出完整时间线。' },
          { type: 'highlight', text: '传染病管理最怕的是"断链"——发现的人不知道后续，后续的人不知道前面。系统把这条链自动串起来，不需要任何人记。' }
        ]),

        ...createContentPage('开学季：新生家长的一百个电话，变成零个', [
          { type: 'paragraph', text: '每年八月底，教务处都会经历同一场"风暴"：新生分班结果公布，家长蜂拥到校门口看公告栏，教务处的电话从早响到晚——"我家孩子在哪个班？""公告栏上没找到名字！""能不能调个班？"' },
          { type: 'paragraph', text: '现在怎么做：学校把分班结果录入系统，设定一个"解禁日期"（比如8月30日）。解禁日之前，任何人查询都看不到结果——防止提前泄露引发不公质疑。' },
          { type: 'paragraph', text: '8月30日当天，学校通过公众号发布查询入口。家长输入孩子的姓名和身份证号，立刻查到：在哪个校区、哪个班。页面上还有一张班级群的二维码——扫一下，直接进群。' },
          { type: 'paragraph', text: '两个信息（姓名+身份证号）对得上才显示结果，防止有人冒查别人的孩子。解禁时间由系统控制，不是"工作人员说了算"。' },
          { type: 'highlight', text: '从"校门口挤满人、电话打爆"，变成"家长在家自己查，三分钟搞定"。教务处那天，一个电话都不用接。' }
        ]),

        // ===== 第三章：李主任的周五下午 =====
        ...createChapterTitle('第三章', '李主任的周五下午', '一位办公室主任的行政日常'),

        ...createContentPage('下午 3:00 —— 教育局发文，限时传达', [
          { type: 'paragraph', text: '李主任是学校办公室主任。周五下午三点，市教育局发来一份文件，要求下周三前全员知晓。' },
          { type: 'paragraph', text: '以前怎么做：把文件复印186份分发？不现实。转发到全校大群？不知道谁看了。在群里@全体成员？消息很快被刷下去。最后只能逐部门打电话："那份文件看了没？"' },
          { type: 'paragraph', text: '现在怎么做：李主任打开公文分发页面，上传文件，勾选"限时办理"，设置最晚日期为下周三。收文范围选"全体教职工"标签——系统自动算出收文人员186人，只读展示，防止漏选多选。提交。' },
          { type: 'paragraph', text: '全员收到通知。周一早上，李主任打开"已读分析"：已读171人。未读的15人，名字列得清清楚楚。李主任不需要打电话问"看了吗"——直接看名单，对未读的人点对点提醒一下就行。' },
          { type: 'highlight', text: '从"发了不知道到没到"变成"发了、到了、读了，全程有数"。' }
        ]),

        ...createContentPage('下午 4:00 —— 编排下周值班表', [
          { type: 'paragraph', text: '每周四下午，李主任要编排下周的值班表。' },
          { type: 'paragraph', text: '以前怎么做：打开Excel，把上周的表复制过来，改日期、改人员。遇到换班的要手动调整。编排一张完整的周值班表（两个校区、两个档期、八个点位），大约需要一个小时。' },
          { type: 'paragraph', text: '现在怎么做：打开"周计划孵化器"页面。选校区"本部"——系统自动列出该校区所有值班点位作为表格行。勾选档期"白班、晚班"。在周一到周日七列里，为每个点位填写值班人。确认后勾选"提交时立即生成值班任务"。' },
          { type: 'paragraph', text: '提交。系统自动生成整周所有值班安排。周五早上，全体值班人员打开手机就能看到自己这周的安排。' },
          { type: 'highlight', text: '从每周一小时，变成每周十分钟。而且排班结果即时对全员可见，不用再打印张贴。' }
        ]),

        ...createContentPage('下午 4:30 —— 月度请假统计', [
          { type: 'paragraph', text: '月底了，人事科要全校教师的请假统计数据。' },
          { type: 'paragraph', text: '以前怎么做：翻这个月的请假条（纸质的），按人汇总：张三事假2天、病假1天、弹性假3次共180分钟。李四……186个人，手工统计，大约需要两个小时。还容易算错。' },
          { type: 'paragraph', text: '现在怎么做：打开请假管理首页的管理面板，输入口令激活统计功能。选择月份。一屏看到：每位教师的各假种天数、弹性假计次和分钟数，全部自动汇总。点击"导出"，一份规范的统计表格直接下载，交给人事。' },
          { type: 'highlight', text: '从两小时手工统计，变成一分钟自动汇总。而且数据来自审批通过的正式记录，不是"凭记忆"。' }
        ]),

        ...createContentPage('下午 5:00 —— 催办未完成的行政任务', [
          { type: 'paragraph', text: '周一例会布置了五项工作。现在是周五，李主任需要检查落实情况。' },
          { type: 'paragraph', text: '以前怎么做：挨个问。"那个报表做了吗？""那个材料交了没？"问一圈下来，有的说"快了"，有的说"忘了"，有的说"卡住了"。到底哪些真完成了、哪些在拖着，李主任心里没底。' },
          { type: 'paragraph', text: '现在怎么做：打开任务看板。五项工作，每项的状态一目了然：两项已完成、两项进行中、一项被标记"阻滞"（遇到困难推进不下去）。被阻滞的那一项，写着具体原因："需要总务处提供场地数据，尚未回复。"' },
          { type: 'paragraph', text: '李主任直接催办总务处。问题明确了，不用挨个打电话问。' },
          { type: 'highlight', text: '"现在有多少事在推进、卡在谁手上、被什么阻滞"——这三个问题，打开看板就有答案。' }
        ]),

        ...createTablePage('李主任的对比表：以前怎么做 vs 现在怎么做', ['行政事务', '以前', '现在', '省了什么'], [
          ['发文传达', '群里转发+电话催，不知道谁看了', '定向分发+已读追踪+一键催办', '不用逐个打电话'],
          ['编排值班表', 'Excel手工编排，每周一小时', '周计划孵化器，十分钟生成整周', '省50分钟/周'],
          ['请假统计', '翻纸条手工汇总，两小时', '系统自动汇总，一分钟导出', '省两小时/月'],
          ['催办工作', '挨个打电话问进度', '看板一眼看清+一键催办', '不用挨个问'],
          ['用车管理', '口头申请，撞车冲突频发', '线上申请+审批，冲突提前发现', '不再撞车'],
          ['公文归档', '纸质存档，找起来费劲', '电子留痕，按日期/标题随时检索', '找文件不再翻箱倒柜']
        ]),

        ...createContentPage('中层最关心的五个问题', [
          { type: 'paragraph', text: '中层干部（年级组长、教导主任、办公室主任）是系统的重度使用者。他们最关心：' },
          { type: 'bullet', text: '问题1：我能不能掌握进度？——能。公文谁读了、任务谁在做、值班谁到岗、关爱谁没做完，都有看板。' },
          { type: 'bullet', text: '问题2：能不能减少重复劳动？——能。同一个信息只录一次（如学生请假），后续自动流转到需要的地方（如体育课考勤）。' },
          { type: 'bullet', text: '问题3：出了问题能不能追到原因？——能。所有操作都有时间、有操作人、有结果，全程留痕。' },
          { type: 'bullet', text: '问题4：规则能不能自动执行？——能。弹性假额度、选课容量限制、公文限时，都是系统自动执行，不依赖个人记忆。' },
          { type: 'bullet', text: '问题5：能不能导出给上级？——能。所有统计都支持导出标准格式表格，直接交给教育局或人事科。' }
        ]),

        // ===== 第四章：王校长的一周 =====
        ...createChapterTitle('第四章', '王校长的一周', '一位校长的管理节奏'),

        ...createContentPage('周一 —— 例会后的任务追踪', [
          { type: 'paragraph', text: '周一上午，校长办公会确定了本周五项重点工作。散会后，办公室主任在系统里逐一创建任务：选目标校区、指定执行人、设定完成时限。' },
          { type: 'paragraph', text: '到了周五，王校长打开任务看板：五项工作中，两项已完成、两项在推进、一项被标记"阻滞"。阻滞原因写得清清楚楚。王校长不需要挨个打电话问——打开看板，全局态势一目了然。' },
          { type: 'highlight', text: '校长关心的不是"谁在忙"，而是"什么事卡住了、卡在谁手上"。看板回答的就是这个。' },
          { type: 'paragraph', text: '而且，如果有外校来访交流，首页会自动显示来访预告："某某学校一行将于周五上午来访"。王校长不用问办公室"这周有没有人来"，打开就能看到。' }
        ]),

        ...createContentPage('周三 —— 看看食堂公示', [
          { type: 'paragraph', text: '食品安全是校长的心头大事。教育局要求学校公开菜谱和餐标，接受家长监督。' },
          { type: 'paragraph', text: '以前怎么做：食堂每周把菜谱打印出来贴在餐厅门口。家长看不到（进不了校门）。教育局来检查，翻纸质台账。出了舆情，学校拿不出"每天都公示了"的证据。' },
          { type: 'paragraph', text: '现在怎么做：食堂管理员每天拍照上传餐标（今天供应什么、多少钱），每周上传带量带价菜谱（每道菜用了多少食材、花多少钱）。所有记录自动归档。' },
          { type: 'paragraph', text: '王校长打开"全局总览"看板：横轴是周一到周日，纵轴是各个校区（如果是集团校）。哪个校区哪天公示了、哪天没公示，一眼看清。没公示的格子显示为空白——不需要问人，空白就是问题。' },
          { type: 'highlight', text: '对家长：看得到孩子吃什么、花多少钱。对校长：随时掌握公示执行情况。对教育局：所有记录可追溯、可导出。' }
        ]),

        ...createContentPage('周四 —— 教师考核审定', [
          { type: 'paragraph', text: '学期末，教师考核进入审定环节。' },
          { type: 'paragraph', text: '以前怎么做：教师交一摞材料——获奖证书复印件、听课记录本、成长手册。考核组翻材料、打分。有的教师材料齐全分数高，有的教师"忘了交"就吃亏。校长签字时心里没底：这些分数经得起追问吗？' },
          { type: 'paragraph', text: '现在怎么做：学期初开始，教师每获一个奖就在系统里登记（上传证书照片），教导处审批确认后入库。学期末考核时，教师打开考核页面——系统自动列出本学期所有已登记的获奖记录，教师只需要确认。' },
          { type: 'paragraph', text: '考核分数 = 基础分（教学工作完成情况）+ 加分项（已审批的获奖）- 扣分项（违规记录）。每一项都有凭证。教师自评一遍，考核组考评一遍，两轨对照。' },
          { type: 'highlight', text: '校长签字时心里有底：每一分都有据可查，经得起任何追问。' }
        ]),

        ...createContentPage('随时 —— 特殊学生的关爱，真的做了吗', [
          { type: 'paragraph', text: '教育局督导时最常问的一个问题："特殊学生的关爱，你们做了吗？做了多少次？谁做的？"' },
          { type: 'paragraph', text: '以前怎么做：学校有一份特殊学生名单，班主任心里有数。但督导要看材料，只能临时补——补谈话记录、补家访照片。谁都说不清"这学期到底谈了几次"。' },
          { type: 'paragraph', text: '现在怎么做：每个特殊学生在系统里有档案，有明确的包保教师（谁负责）和包保领导（谁监督）。每月应该关爱几次、做了几次、还差几次，实时显示在包保教师的首页。' },
          { type: 'paragraph', text: '每次谈心、家访、辅导，教师用手机登记：选一下形式、写两句内容、拍一张照片。30秒的事。月末校长打开统计：全校32名在案学生，应做128次，已做119次，9次未完成——哪几个学生、差在谁身上，清清楚楚。对没完成的，点一下"提醒"，教师手机上就收到通知。' },
          { type: 'highlight', text: '"一生一案"不再是一句口号，而是系统里可数、可查、可追的记录。督导来了，打开系统就是答案。' }
        ]),

        ...createContentPage('期末 —— 一屏看全局', [
          { type: 'paragraph', text: '学期末，教育局要数据、校务会要汇报、家长会要材料。' },
          { type: 'paragraph', text: '以前怎么做：找教导处要教学数据、找政教处要德育数据、找总务处要后勤数据、找办公室要行政数据。每个部门格式不同、口径不同，汇总起来焦头烂额。' },
          { type: 'paragraph', text: '现在怎么做：打开综合报表门户。所有报表按重要性排列——教学运行、教师考核、学生关爱、行政办公、后勤保障。点击任何一个，直接看数据。不需要记"那个报表在哪个系统里"，一个入口全部到达。' },
          { type: 'highlight', text: '校长不需要"找人要数据"，只需要"打开看板看数据"。' }
        ]),

        ...createContentPage('校长最关心的五个问题', [
          { type: 'paragraph', text: '校长关心的不是操作细节，而是"这套系统能不能兜住底线、看清全局"：' },
          { type: 'bullet', text: '问题1：出了安全事故，能不能证明学校尽到了责任？——能。晨午检有记录、异常有请假、传染病有复课证明、关爱有照片。全程留痕，随时可调取。' },
          { type: 'bullet', text: '问题2：教师会不会觉得"又多了一个负担"？——不会。系统的核心逻辑是"把原来要写纸质表、跑签字、打电话的事，变成手机点两下"。教师感知到的是"省事"，不是"加活"。' },
          { type: 'bullet', text: '问题3：数据可信吗？会不会造假？——关键数据都有双重保障。比如体育课考勤，班主任报请假、体育老师报出勤，两边独立填报，系统自动比对——两边都瞒不住。' },
          { type: 'bullet', text: '问题4：能对接教育局的检查要求吗？——能。所有台账都是结构化的，可以按日期、按班级、按教师随时导出。不再需要"检查前突击补材料"。' },
          { type: 'bullet', text: '问题5：万一用不起来怎么办？——前两周我们的人驻场支持。教师不需要培训——打开钉钉就能用。如果个别教师确实不适应，可以纸质兜底、事后补录。' }
        ]),

        ...createTablePage('校长视角：系统回答的五个管理问题', ['管理问题', '以前的状态', '现在的状态', '对应功能'], [
          ['工作落实了吗？', '挨个打电话问，回答模糊', '看板一目了然，阻滞有原因', '任务追踪'],
          ['文件都看了吗？', '群里转发，无法确认', '已读/未读精确到每个人', '公文分发'],
          ['学生安全吗？', '纸质晨检表，无法汇总', '每日两次自动汇总，缺勤有人跟到底', '晨午检'],
          ['食堂合规吗？', '纸质台账，检查前突击补', '每日公示留痕，随时可查', '放心餐'],
          ['考核公平吗？', '材料多寡决定分数', '每一分有凭证，自评考评对照', '教师考核']
        ]),

        // ===== 第五章：六大场景速览 =====
        ...createChapterTitle('第五章', '六大场景速览', '每个场景做什么、解决什么问题'),

        ...createContentPage('场景一：教学管理 —— 让课表"活"起来', [
          { type: 'paragraph', text: '解决的核心问题：课表变更混乱（调了课没人知道）、选修课报名超员、体育课点名失真、听课评课走过场。' },
          { type: 'bullet', text: '一张活的课表：任何人任何时刻查到的课表，都反映了全部已生效的变更。调了课，课表上立刻变。' },
          { type: 'bullet', text: '调代课走审批：不再"微信群里喊一嗓子"。谁发起、谁批准、什么时候，全部有记录。' },
          { type: 'bullet', text: '选课不超员：系统自动控制名额，学生选满了就选不了。不需要老师数人头。' },
          { type: 'bullet', text: '体育课双保险：班主任报请假、体育老师报出勤，两边独立填，系统自动比对。"没请假也没来"的学生会被自动发现。' },
          { type: 'bullet', text: '听评课有沉淀：听课记录、评分、研讨内容全部入库。期末不再"凭印象回忆这学期听了多少课"。' }
        ]),

        ...createContentPage('场景二：行政办公 —— 让流程跑起来', [
          { type: 'paragraph', text: '解决的核心问题：公文"发了≠到了≠读了"、请假额度靠记忆、用车冲突频发、值班排班费时。' },
          { type: 'bullet', text: '公文必达：分发到人、阅读留痕、未读可催。不再"群里发了就算完"。' },
          { type: 'bullet', text: '规则代替记忆：弹性假额度、半天折算、单次上限，全部由系统自动执行。不依赖"年级组长记得"。' },
          { type: 'bullet', text: '申请即留痕：用车、换班这些以前靠口头的事，全部变成正式记录。事前可审批、事后可查。' },
          { type: 'bullet', text: '排班半自动化：一次操作生成整周值班表，替代每周一小时的Excel手工编排。' },
          { type: 'bullet', text: '监督有据：值班到岗情况有照片、有记录。不再是"没人管"。' }
        ]),

        ...createContentPage('场景三：学生关爱 —— 让每个孩子被看见', [
          { type: 'paragraph', text: '解决的核心问题：特殊学生关爱"有名单无过程"、心理测评"测了白测"、晨午检"填了白填"、分班公布时电话被打爆。' },
          { type: 'bullet', text: '责任到人：每个特殊学生有明确的包保教师。"谁的孩子谁抱走"，不是口号，是系统里的字段。' },
          { type: 'bullet', text: '关爱有记录：每次谈心、家访、辅导都有登记。"应做5次、已做3次、还欠2次"，实时可见。' },
          { type: 'bullet', text: '心理筛查不白测：测评结果不是"测完就扔"，而是直接进入关注名单、进入关爱体系。' },
          { type: 'bullet', text: '晨午检不重复录入：一次填报同时完成健康台账、缺勤台账、请假发起三件事。' },
          { type: 'bullet', text: '分班查询零人工：家长输入孩子姓名和身份证号，自己查。教务处不再接一百个电话。' }
        ]),

        ...createContentPage('场景四：后勤保障 —— 让每顿饭透明', [
          { type: 'paragraph', text: '解决的核心问题：家长不知道孩子吃什么、食堂公示无法核查、用餐管理靠纸质登记。' },
          { type: 'bullet', text: '带量带价菜谱：每道菜标注食材用量和价格。家长看得到"钱花在哪里"，过敏孩子的家长有据可查。' },
          { type: 'bullet', text: '每日餐标公示：每天的照片留痕，管理层随时可查"哪天公示了、哪天没公示"。' },
          { type: 'bullet', text: '用餐一步点餐：教师打开手机，什么都不用填，点一下就完成。学生由值班教师代点。' },
          { type: 'bullet', text: '审查有依据：应餐人数、点餐人数、实际用餐人数，三层数据可对比。异常一目了然。' },
          { type: 'highlight', text: '核心价值：食品安全透明化。出了舆情，学校能拿出完整的公示记录自证清白。' }
        ]),

        ...createContentPage('场景五：运营与信息 —— 让全局可见', [
          { type: 'paragraph', text: '解决的核心问题：任务布置靠口头、宣传内容散落在各处、门禁靠钥匙、电子班牌"有屏无内容"、报表找不到入口。' },
          { type: 'bullet', text: '任务追踪：每件事有出处、有责任人、有审批、有状态。"卡在谁手上"一屏看清。' },
          { type: 'bullet', text: '校园宣传阵地：新闻、教程、学生作品有统一发布平台。学生作品可以点赞、排行，激励创作。' },
          { type: 'bullet', text: '手机开门：值班人员不需要拿钥匙，手机上点一下就能开门。有授权、有记录。' },
          { type: 'bullet', text: '电子班牌集控：管理端发一次内容，全校班牌同步更新。不再U盘拷贝逐台操作。' },
          { type: 'bullet', text: '报表一个入口：所有报表集中在一个门户里，按重要性排列。不用记十几个网址。' }
        ]),

        ...createContentPage('场景六：教师发展 —— 让评价有据可依', [
          { type: 'paragraph', text: '解决的核心问题：评价标准因人而异、考核依据事后补录、学生评价"只见分数不见成长"。' },
          { type: 'bullet', text: '三视角评价：同事看协作、考核组看实绩、行政部门看规范。三个视角叠加，还原教师完整画像。' },
          { type: 'bullet', text: '日常留痕，期末有据：平时做的每件事（获奖、听课、值班）都在系统里有记录。期末考核不再"突击补材料"。' },
          { type: 'bullet', text: '自评考评双轨：教师自己评一遍，考核组评一遍，差异一目了然。既是约束也是申诉依据。' },
          { type: 'bullet', text: '学生画像不只是分数：品格五维（爱、律、礼、勤、洁）+ 各科兴趣习惯，家长看到的是一份完整的成长报告。' },
          { type: 'bullet', text: '成绩单可分享：语文习作评价、口语评价，期末自动生成报告页，截图发到家长群。' }
        ]),

        ...createTablePage('六大场景关键数据一览', ['场景', '核心能力', '教师感知', '管理层感知'], [
          ['教学管理', '课表查询·调代审批·选课·考勤·听评课', '查课表、调课不跑腿', '变更100%留痕'],
          ['行政办公', '公文·请假·用车·值班', '请假30秒、不用跑腿', '进度可视、规则自动执行'],
          ['学生关爱', '特殊学生·心理测评·晨午检·分班', '晨检5分钟、不重复填', '责任到人、过程可查'],
          ['后勤保障', '菜谱公示·餐标·点餐·核销', '点餐3秒', '公示完整率可追踪'],
          ['运营信息', '任务·宣传·门禁·班牌·报表', '任务待办清晰', '全局态势一屏'],
          ['教师发展', '评价·考核·学科评价·学生报告', '获奖随时登记', '每一分有据可查']
        ]),

        // ===== 第六章：家长视角 =====
        ...createChapterTitle('第六章', '家长能看到的', '不装软件、不注册，该知道的都知道'),

        ...createContentPage('家长视角：四件事', [
          { type: 'paragraph', text: '这套系统对家长是"零门槛"的——不需要下载任何软件、不需要注册账号、不需要学习操作。家长通过学校发的链接或二维码，直接看信息。' },
          { type: 'bullet', text: '看菜谱：每周五，班级群收到本周菜谱——每道菜用了什么食材、多少克、多少钱。过敏孩子的家长提前跟班主任沟通。' },
          { type: 'bullet', text: '看餐标：每天的餐标照片可查——今天实际供应了什么、价格是多少。不是"菜谱上写的好看，实际吃的另一回事"。' },
          { type: 'bullet', text: '看孩子评价：学期末收到孩子的综合发展报告——品格五个维度的星级、各科学习兴趣和习惯的评价、教师的个性化寄语。不只是一张成绩单。' },
          { type: 'bullet', text: '查分班：开学前，输入孩子姓名和身份证号，查到在哪个班。不用打电话问教务处、不用到校门口挤着看公告栏。' },
          { type: 'highlight', text: '家长的体验：该知道的信息，学校主动推送、随时可查。不该看到的信息（其他孩子的数据），完全看不到。' }
        ]),

        ...createContentPage('家校信任从哪里来', [
          { type: 'paragraph', text: '家校矛盾很多时候来自"信息不对称"——家长不知道学校做了什么，学校不知道家长在想什么。' },
          { type: 'paragraph', text: '这套系统解决信息不对称的方式不是"给家长开一个管理后台"（那会引发隐私问题），而是：' },
          { type: 'bullet', text: '主动公示：菜谱、餐标这些"应该公开"的信息，系统自动推送，不需要家长问。' },
          { type: 'bullet', text: '按需查询：分班结果、孩子评价这些"涉及个人"的信息，凭身份信息自助查询。' },
          { type: 'bullet', text: '边界清晰：家长只能看到自己孩子的信息，看不到其他孩子的。心理数据、健康数据对家长完全不可见。' },
          { type: 'highlight', text: '一句话：该透明的透明，该保护的保护。不多给，也不少给。' }
        ]),

        // ===== 第七章：常见问题 =====
        ...createChapterTitle('第七章', '常见问题', '教师、中层、校长各问各的'),

        ...createContentPage('教师常见问题', [
          { type: 'bullet', text: '问：要不要另外下载App？——不用。全部在钉钉里，您现在用的那个钉钉。' },
          { type: 'bullet', text: '问：操作复杂吗？——不复杂。核心操作都是"选一下、点一下"。晨检全程不需要打字。' },
          { type: 'bullet', text: '问：会不会占用教学时间？——恰恰是省时间。以前写请假条跑签字要10分钟，现在手机上30秒。' },
          { type: 'bullet', text: '问：我的考核数据会不会被别人看到？——不会。您只能看到自己的数据。管理层的汇总视图不包含您的个人详情。' },
          { type: 'bullet', text: '问：如果手机没电了/断网了怎么办？——关键操作（如晨检）可以事后补录。不因为一次没电就造成记录缺失。' },
          { type: 'bullet', text: '问：我不想被"数字化监控"。——系统记录的是"事务"（请假、值班、获奖），不是"行为"（不追踪您的位置、不监控您的课堂）。' }
        ]),

        ...createContentPage('中层常见问题', [
          { type: 'bullet', text: '问：跟现在用的钉钉是什么关系？——就是在钉钉里加几个应用。不需要另外注册、另外维护账号。' },
          { type: 'bullet', text: '问：需要买服务器吗？——不需要。全部在云端运行，学校零硬件投入。' },
          { type: 'bullet', text: '问：数据导出来是什么格式？——标准表格格式，可以直接交给教育局或人事科，不需要二次整理。' },
          { type: 'bullet', text: '问：能不能按我们学校的情况调整规则？——能。弹性假额度、关爱级别、考核分值这些都是可配置的。' },
          { type: 'bullet', text: '问：学期中途换了一个新教师/新班级怎么办？——基础数据随时可以增补，不影响已有数据。' },
          { type: 'bullet', text: '问：教师抵触怎么办？——前两周我们驻场支持。实际上教师用了第一周就会发现"比写纸条省事"，抵触自然消失。' }
        ]),

        ...createContentPage('校长常见问题', [
          { type: 'bullet', text: '问：上线周期多久？——四周。第一周导数据，第二周上核心功能，第三周扩展，第四周全面推广。' },
          { type: 'bullet', text: '问：需要多少预算？——零硬件投入（不买服务器、不买设备）。只涉及钉钉平台的基础服务费。' },
          { type: 'bullet', text: '问：跟教育局的检查要求能对接吗？——能。所有台账都是结构化的，随时按检查要求导出。不再需要"检查前突击补材料"。' },
          { type: 'bullet', text: '问：数据安全怎么保证？——学生心理数据、健康数据按最严格标准管理：最小化收集、按需可见、全程留痕。班主任只能看自己班的数据。' },
          { type: 'bullet', text: '问：万一平台出故障了怎么办？——云端服务可用率99.5%以上。万一短暂不可用，不影响正常教学——只是"暂时不能在手机上操作"，纸质兜底随时可补。' },
          { type: 'bullet', text: '问：能不能先试点再推广？——可以。建议先从一个年级或几个核心场景开始（如课表+请假+公文），跑顺了再铺开。' }
        ]),

        // ===== 第八章：实施路径与服务承诺 =====
        ...createChapterTitle('第八章', '实施路径与服务承诺', '四周上线，长期陪伴'),

        ...createContentPage('实施四步走', [
          { type: 'paragraph', text: '我们不做"交钥匙就走"的项目。实施分四步，每一步都有明确交付物：' },
          { type: 'bullet', text: '第1周（数据准备）：导入班级信息、教师名单、校区结构。交付物：基础数据就绪确认单。' },
          { type: 'bullet', text: '第2周（核心上线）：课表管理、请假审批、公文分发三个场景上线。交付物：教师开始实际使用。' },
          { type: 'bullet', text: '第3周（扩展上线）：学生关爱、晨午检、用餐管理、值班管理上线。交付物：全校场景覆盖。' },
          { type: 'bullet', text: '第4周（推广优化）：全面推广使用，收集教师反馈，微调规则和配置。交付物：使用率达标确认。' },
          { type: 'highlight', text: '判断"上线成功"的标准不是"系统部署了"，而是"教师真的在用、真的觉得省事"。' }
        ]),

        ...createContentPage('服务承诺', [
          { type: 'bullet', text: '承诺一：前两周驻场支持。实施期间我们的人在学校，随时解答教师问题。' },
          { type: 'bullet', text: '承诺二：零培训上手。所有功能设计为"教师不培训也会用"。如果有教师确实需要帮助，我们一对一辅导。' },
          { type: 'bullet', text: '承诺三：规则可配置。弹性假额度、考核分值、关爱级别等规则，按学校制度配置，不是"一刀切"。' },
          { type: 'bullet', text: '承诺四：数据可导出。所有数据归学校所有，随时可以导出标准格式表格。' },
          { type: 'bullet', text: '承诺五：持续迭代。教师使用中的反馈，按月收集、按季迭代。系统会越来越贴合学校的实际需要。' },
          { type: 'bullet', text: '承诺六：隐私兜底。学生敏感信息（心理、健康、家庭）按最高标准保护，绝不对外泄露。' }
        ]),

        ...createTablePage('实施时间线', ['阶段', '时间', '做什么', '谁来做', '交付物'], [
          ['数据准备', '第1周', '导入班级、教师、校区数据', '我们+学校信息中心', '数据就绪确认'],
          ['核心上线', '第2周', '课表+请假+公文三场景', '我们驻场+教师试用', '教师开始使用'],
          ['扩展上线', '第3周', '关爱+晨检+用餐+值班', '我们驻场+管理层推动', '全场景覆盖'],
          ['推广优化', '第4周', '全面推广+反馈收集+微调', '学校自主+我们远程', '使用率达标']
        ]),

        // ===== 结尾页 =====
        new Paragraph({ spacing: { before: 1000 }, children: [] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: '让每一堂课有迹可循', size: 44, bold: true, color: colors.primary, font: FONT })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: '让每一份关爱被看见', size: 44, bold: true, color: colors.primary, font: FONT })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: '让每一个决策有数据', size: 44, bold: true, color: colors.primary, font: FONT })]
        }),
        new Paragraph({ spacing: { before: 600 }, children: [] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: '不是给学校加系统，是替学校减负担。', size: 28, color: colors.secondary, font: FONT })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 400 },
          children: [new TextRun({ text: '联系我们，预约一次30分钟的演示', size: 24, color: colors.gray, font: FONT })]
        })
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync('智慧校园全场景解决方案-宣传册.docx', buffer);
  console.log('文档生成成功：智慧校园全场景解决方案-宣传册.docx');
}

generateDocument().catch(console.error);
