深度网络里那一层 `BatchNorm`、`LayerNorm`、`GroupNorm`，几乎每个模型都在用，但很多人说不清它们到底差在哪。答案其实非常干净：它们做的都是同一件事——减均值、除标准差、再来一个可学习的缩放平移；唯一的区别是**统计量在哪些维度上求**。

把这一点想透，剩下的“什么时候用哪个”“为什么 Transformer 不用 BN”“为什么小 batch 检测任务改用 GN”就都成了推论。

## 一个统一的视角

给定一批激活值，任何归一化层都在算同一个式子：

$$
y = \gamma \cdot \frac{x - \mu_S}{\sqrt{\sigma_S^2 + \varepsilon}} + \beta
$$
其中 $\mu_S$、$\sigma_S^2$ 是在某个元素集合 $S$ 上求出的均值和方差，$\gamma$、$\beta$ 是可学习的仿射参数，$\varepsilon$ 防止除零。**所有归一化层的公式都一样，区别只有一个：$S$ 是谁。**

以视觉里最常见的四维张量为例，形状记作 `(N, C, H, W)`——batch、通道、高、宽。不同的归一化，就是沿不同的轴去做“求均值方差”的规约：

| 方法 | 统计量在哪些维度上求 | 每套统计量的数量 | 是否依赖 batch |
|---|---|---|---|
| BatchNorm | `N, H, W`（每个通道一套） | `C` | **是** |
| LayerNorm | `C, H, W`（每个样本一套） | `N` | 否 |
| InstanceNorm | `H, W`（每样本每通道一套） | `N × C` | 否 |
| GroupNorm | 组内的 `C/G, H, W`（每样本每组一套） | `N × G` | 否 |

一句话记忆:**BatchNorm 是“跨样本、按通道”比较,其余三个都是“在单个样本内部”比较**,差别只在于把多少通道圈到一起。GroupNorm 正好把这条线连起来了:`G = 1` 时它退化成对整幅特征图的 LayerNorm,`G = C` 时退化成 InstanceNorm。

用 PyTorch 的规约维度看最直观:

```python
# x: (N, C, H, W)

# BatchNorm：每个通道一套统计量，跨 batch 和空间
mean = x.mean(dim=(0, 2, 3), keepdim=True)      # -> (1, C, 1, 1)

# GroupNorm：把 C 分成 G 组，每个样本、每组一套
xg = x.reshape(N, G, C // G, H, W)
mean = xg.mean(dim=(2, 3, 4), keepdim=True)     # -> (N, G, 1, 1, 1)

# InstanceNorm：每样本每通道，只在空间上求
mean = x.mean(dim=(2, 3), keepdim=True)         # -> (N, C, 1, 1)
```

## LayerNorm 的两种口径，别混

上表里 LayerNorm 写的是“在 `C, H, W` 上求”，那是 GroupNorm 论文里为了跟 BN/GN 对齐用的视觉口径。但你在 Transformer 里天天见到的 LayerNorm **不是这个**。

Transformer 的激活形状通常是 `(N, T, C)`——batch、序列长度、特征维。那里的 LayerNorm 只在**最后的特征维 `C`** 上求统计量,每个 token 各归各的:

```python
# x: (N, T, C)，Transformer 里的 LayerNorm
mean = x.mean(dim=-1, keepdim=True)             # -> (N, T, 1)
```

也就是说,它问的是“**这个 token 的这些特征彼此之间**分布如何”,完全不看别的 token、更不看别的样本。这正是它适配变长序列的原因:序列多长、batch 多大都不影响单个 token 的归一化结果。所以严格说,“LayerNorm 在哪些维度上求”取决于你把它用在什么形状的张量上;搞混这两种口径是很常见的困惑来源。

## 为什么会有这么多种

**BatchNorm 解决的是训练深网络的优化问题**,但代价是把一个 batch 里的样本耦合到了一起。这带来几个绕不开的麻烦:

- **依赖 batch 大小**。统计量在整个 batch 上求,batch 一小(检测、分割、大分辨率任务里常常只能塞 2~4 张图),均值方差就带很大噪声,效果崩。
- **训练/推理不一致**。训练用当前 batch 的统计量,推理时没有 batch,得改用训练期间滑动平均出来的 running mean/var。两套行为的切换(`model.eval()`)是经典 bug 来源。
- **不适合变长序列和在线场景**。RNN、流式推理里“batch 内跨样本求统计量”根本不成立。

**LayerNorm / GroupNorm / InstanceNorm 都是为了摆脱对 batch 的依赖**——它们只在单个样本内部求统计量,于是训练和推理行为完全一致,batch 大小、序列长度都无所谓。

选型基本就落在这条主线上:

- **CNN 分类、batch 够大** → BatchNorm 仍是强基线,还能在推理时“免费”折叠掉(下一节)。
- **Transformer、RNN、任何变长/流式** → LayerNorm。现代 LLM 多用它的简化版 **RMSNorm**:去掉减均值那一步,只按均方根缩放,少一次规约、少存一个统计量,质量基本不掉。
- **视觉但 batch 被迫很小**(目标检测、语义分割、高分辨率) → GroupNorm。它不看 batch,小 batch 下比 BN 稳得多,论文里 `G = 32` 是常用默认。
- **风格迁移这类要抹掉单图对比度/风格的任务** → InstanceNorm。

## 推理时的代价:能不能折叠

这一点对做推理优化的人尤其重要,却常被忽略。

BatchNorm 在推理时用的是**固定的** running mean/var 和 `γ/β`——全是常量。一个“线性变换 + 常量归一化”可以直接**融进前一层的卷积或全连接的权重和偏置里**,推理时零额外开销。这也是为什么部署 CNN 时几乎总会做 BN folding。

LayerNorm 和 GroupNorm 折不掉:它们的均值方差是**在推理时、针对当前这条输入现算的**,不是常量,没法预先并进权重。于是每一层都要在前向里实打实地做一遍规约(求和、求平方和、开方、逐元素缩放)。这类算子是**访存受限**的,在纯 CPU 环境里,这部分开销不像卷积那样能靠算力硬扛,反而经常成为值得单独优化(算子融合、减少中间张量、用 RMSNorm 省一次规约)的点。换句话说,BN 和 LN/GN 的差别不只在精度和适用场景,也直接写在推理时的成本结构里。

## 容易踩的坑

- **BatchNorm 配小 batch**:batch 为 1、2 时统计量噪声极大,要么换 GroupNorm,要么用跨卡同步的 SyncBN 把有效 batch 做大。
- **忘了切 eval 模式**:推理时没调 `model.eval()`,BN 仍在用当前 batch 的统计量,结果随 batch 内容漂移,很难查。
- **在 Transformer 里硬塞 BatchNorm**:序列建模里几乎总是 LayerNorm/RMSNorm,BN 的跨样本假设不成立。
- **GroupNorm 的组数不整除通道数**:`G` 必须能整除 `C`,否则直接报错;换 backbone、改通道数时容易忘。

## 小结

把这三层放到同一个式子里看,它们不是三种不同的操作,而是**同一操作在不同维度上求统计量**的三个特例:

- **BatchNorm**——跨样本、按通道,精度强但绑 batch,推理可折叠;
- **LayerNorm**——样本内、按特征,与 batch 无关,序列模型的默认;
- **GroupNorm**——样本内、按通道分组,小 batch 视觉任务的稳妥选择,一端接 LayerNorm、一端接 InstanceNorm。

记住“统计量在哪些维度上求”,剩下的取舍都能自己推出来。
