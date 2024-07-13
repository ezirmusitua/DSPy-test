/* mkdir
 * yarn install
 * export OPENAI_API_KEY=<your api key>
 * node .
 */
const { OpenAI } = require("openai");

function rndPick(items, count) {
  const copy = [...items];
  const result = [];
  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(Math.random() * copy.length);
    result.push(copy[randomIndex]);
    copy.splice(randomIndex, 1);
  }
  return result;
}

function findIndexOfMaxValue(arr) {
  if (arr.length === 0) return -1;
  let max_index = 0;
  let max_value = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] <= max_value) continue;
    max_value = arr[i];
    max_index = i;
  }

  return max_index;
}

async function request_llm(
  content,
  model = "deepseek-chat",
  temperature = 0.0,
) {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: "https://api.deepseek.com/v1",
  });
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content }],
      temperature,
    });
    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error asking question:", error);
  }
}

class CoTModule {
  type = "cot";

  constructor(input, output, model = "deepseek-chat") {
    this.input = input;
    this.output = output;
    this.model = model;
    this.prompt = `请根据给定的"${input}"字段中的内容，生成"${output}"字段，请遵循下面的格式：
---
问题：${input}
推理：一步一步的思考然后进行回答
回答：${output}
---
`;
  }

  async run(question, temperature = 0.0) {
    const content = this.prompt + `\n问题：${question}`;
    return request_llm(content, this.model, temperature);
  }

  updatePrompt(fn) {
    this.prompt = fn(this.prompt);
  }

  copy() {
    return new CoTModule(this.input, this.output);
  }
}

class FewShotsTeleprompters {
  constructor(
    data,
    model = "deepseek-chat",
    shot_count = 2,
    student_count = 3,
  ) {
    this.data = data;
    this.model = model;
    this.shot_count = shot_count;
    this.student_count = student_count;
  }

  async compile(module) {
    const shots = await this.prepareShots(module);
    const students = this.prepareStudents(module, shots);
    const students_score = await this.startExam(students);
    const best_index = findIndexOfMaxValue(students_score);
    return students[best_index];
  }

  prepareStudents(module, shots) {
    return Array.from({ length: this.student_count }).map(() => {
      const m = module.copy();
      m.updatePrompt((p) => p + rndPick(shots, this.shot_count).join("\n"));
      return m;
    });
  }

  async prepareShots(module) {
    let shots = [];
    switch (module.type) {
      case "cot":
        shots = await this.prepareCoTShots(module);
        break;
      default:
        shots = data
          .slice(0, data.length - 3)
          .map(
            (p) =>
              `---\n${module.input}：${module.input}\n${pair[module.output]}：${pair[module.output]}\n---\n`,
          );
        break;
    }
    return shots;
  }

  async prepareCoTShots(module) {
    return await Promise.all(
      this.data.slice(0, this.data.length - 3).map(async (pair) => {
        const answer = await request_llm(
          `请生成从“${module.input}“字段推导得到“${module.output}“字段的推理过程，只需要生成“推理过程”即可。
下面是一个例子：
---
问题：如何使用 Python 打印 "Hello, world"
回答：如果使用 Python2.x，使用 \`print 'Hello, World'\`，如果使用 Python3.x，使用 \`print('Hello, World')\`
推理：
1. Python 有两个版本：2.x 和 3.x，在不确定用户使用版本的情况下应当回复两个版本的方式
2. 在 Python2.x 中，使用 \`print "Hello, World"\` 可以打印
3. 在 Python3.x 中，使用 \`print("Hello, World")\` 可以打印
4. 综上，如果使用 Python2.x，使用 \`print 'Hello, World'\`，如果使用 Python3.x，使用 \`print('Hello, World')\`
—
${module.input}：${pair[module.input]}
${module.output}：${pair[module.output]}
`,
          this.model,
          0.5,
        );
        return `---\n${[module.input]}：${pair[module.input]}\n推理：${answer}\n${module.output}：${pair[module.output]}\n---\n`;
      }),
    );
  }

  async startExam(students) {
    const student_exams = students.map(() => 0);
    for (const question of this.data.slice(this.data.length - 3)) {
      for (let i = 0; i < students.length; i += 1) {
        const answer = await students[i].run(question[module.input]);
        const score = await request_llm(
          `请为下面的问题与回复进行评分，其中“问题”是带回答的问题，“回答”是学生的回复，“参考”答案是预期的答案，请根据“回答”和“参考”间的匹配程度进行评分，分值为 1，2，3，4，5，仅需回复评分，无需额外的解释。
  ---
  问题：${question[module.input]}
  回答：${answer}
  参考：${question[module.output]}
  ---
  `,
          this.model,
          0.0,
        );
        student_exams[i] += Number(score);
      }
    }
    return student_exams;
  }
}

const TEST_DATA = [
  { [input]: "法国的首都是哪座城市？", [output]: "巴黎" },
  {
    [input]: "简单地说明什么是大语言模型",
    [output]:
      "大语言模型是一个 NLP 中概念，由具有许多参数的人工神经网络组成，使用自监督学习或半监督学习对大量未标记文本进行训练。",
  },
  {
    [input]: "冰箱时如何制冷的？",
    [output]:
      "冰箱制冷的基本原理是通过循环工作流体（通常是制冷剂）在封闭系统中的状态变化来实现的，其基本步骤包括：压缩、冷凝、膨胀、蒸发、返回压缩机。这个循环不断重复，从而持续地将冰箱内部的热量转移到外部环境中，实现制冷效果。冰箱的制冷系统设计得非常高效，能够在不消耗过多电能的情况下保持恒定的低温。",
  },
  {
    [input]:
      "小明在淘宝上花了 30 元买了一个风扇，他是 88VIP 打了 5 折，并且使用了一个 5 元的优惠券，这个风扇原价多少钱？",
    [output]: "65元",
  },
  {
    [input]: "为什么要给猫绝育？",
    [output]:
      "给猫咪绝育有以下几点好处，一是能够控制繁殖，二是能够减少猫的攻击性行为，三是能够延长猫的寿命。",
  },
  {
    [input]: "Python 中如何打印“Hello, World”",
    [output]:
      "如果使用 Python2.x，使用 `print 'Hello, World'`，如果使用 Python3.x，使用 `print('Hello, World')`",
  },
  {
    [input]: "过量摄入盐分有什么坏处？",
    [output]:
      "过量摄入盐分（钠）可能会对人体健康产生多种负面影响，包括：\n- 高血压：高盐饮食是导致高血压的主要因素之一。高血压会增加心脏病、中风和肾脏疾病的风险。\n- 心血管疾病：长期高盐摄入可能导致动脉硬化和心血管疾病，包括心脏病和中风。\n- 肾脏问题：过多的盐分需要肾脏更努力地工作来排除体外，这可能导致肾脏负担加重，长期可能损害肾脏功能。\n- 水肿：摄入过多的盐分可能导致体内水分潴留，引起水肿，尤其是在脚踝和腿部。\n- 骨质疏松：高盐饮食可能导致钙质从尿液中排出增加，这可能与骨质疏松和骨折风险增加有关。\n- 胃癌风险增加：一些研究表明，高盐饮食可能与胃癌风险增加有关。 \n- 影响药物效果：高盐饮食可能影响某些药物的效果，如利尿剂和降压药。",
  },
  {
    [input]: "断食是否真的对健康有益处？",
    [output]:
      "断食，即在一定时间内不摄入或极少摄入食物，是一种古老的实践，近年来因其潜在的健康益处而受到科学界的关注。断食的方式多种多样，包括间歇性断食（如16/8断食法，即每天在8小时内进食，其余16小时断食）、周期性断食（如5:2断食法，即一周中选择两天摄入极低热量）和长期断食（如连续24小时或更长时间不进食）。然而，断食并不适合所有人，特别是孕妇、哺乳期妇女、儿童、老年人、体重过轻者、有进食障碍史的人以及某些慢性疾病患者。此外，断食可能会导致一些短期副作用，如饥饿、疲劳、头痛和情绪波动。在考虑断食之前，最好咨询医生或营养专家，以确保这种做法适合您的个人健康状况，并了解如何安全地实施断食。此外，断食期间的营养摄入也非常重要，以确保身体获得必需的营养素。",
  },
];

async function main() {
  const input = "问题";
  const output = "回答";
  const module = new CoTModule(input, output);
  const compiler = new FewShotsTeleprompters(TEST_DATA);
  const module_compiled = await compiler.compile(module);
  console.log("[INFO] best module is ", module_compiled);
  console.log("----------");
  if (!module_compiled) {
    console.log("[ERROR] something wrong");
    return;
  }
  for (const data of test_data) {
    console.log(`[INFO] ${input}           ：${data[input]}\n---`);
    const [a1, a2] = await Promise.all([
      module.run(data[input]),
      module_compiled.run(data[input]),
    ]);
    console.log(`[INFO] expected ${output}    ：${data[output]}\n---`);
    console.log(`[INFO] module ${output}      ：${a1}\n---`);
    console.log(`[INFO] best module ${output} ：${a2}\n---`);
    console.log("----------");
  }
}

main();
