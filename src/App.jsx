import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  CssBaseline,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Step,
  StepButton,
  Stepper,
  TextField,
  ThemeProvider,
  Typography,
  createTheme,
} from '@mui/material';

const enzymes = {
  taq: { label: 'Taq DNA 聚合酶', optimalTemp: 72, note: '耐高温，是 PCR 技术中常见的热稳定 DNA 聚合酶。' },
  pfu: { label: 'Pfu DNA 聚合酶', optimalTemp: 75, note: '保真性较高，适合需要降低突变率的扩增。' },
  q5: { label: 'Q5 DNA 聚合酶', optimalTemp: 70, note: '高保真聚合酶，常用于精确扩增。' },
};

const steps = ['配制体系', '模板与引物', 'PCR 程序', '电泳检测', '回收测序'];
const markerSizes = [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100];

const theme = createTheme({
  palette: {
    primary: { main: '#1f7a68' },
    secondary: { main: '#d97706' },
    background: { default: '#eef7f4', paper: '#ffffff' },
  },
  typography: {
    fontFamily: '"Noto Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif',
    h3: { fontWeight: 800, letterSpacing: '-0.04em' },
    h5: { fontWeight: 800 },
    h6: { fontWeight: 700 },
  },
  shape: { borderRadius: 18 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 700, borderRadius: 999 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { boxShadow: '0 20px 70px rgba(20, 83, 73, 0.12)' },
      },
    },
  },
});

function randomDna(length = 500) {
  const bases = ['A', 'T', 'C', 'G'];
  return Array.from({ length }, () => bases[Math.floor(Math.random() * bases.length)]).join('');
}

function cleanDna(sequence) {
  return String(sequence).toUpperCase().replace(/[^ATCG]/g, '');
}

function reverseComplement(seq) {
  const complement = { A: 'T', T: 'A', C: 'G', G: 'C' };
  return cleanDna(seq).split('').reverse().map((base) => complement[base] || '').join('');
}

function calculateTm(primer) {
  const seq = cleanDna(primer);
  const aCount = (seq.match(/A/g) || []).length;
  const tCount = (seq.match(/T/g) || []).length;
  const gCount = (seq.match(/G/g) || []).length;
  const cCount = (seq.match(/C/g) || []).length;

  if (!seq.length) return 0;
  if (seq.length <= 14) return Number((2 * (aCount + tCount) + 4 * (gCount + cCount)).toFixed(1));
  return Number((64.9 + (41 * (gCount + cCount - 16.4)) / seq.length).toFixed(1));
}

function getGelBandY(size, height) {
  return height - Math.log10(size) * 118;
}

function getMarkerRange(size) {
  if (!size) return null;

  const sortedSizes = [...markerSizes].sort((a, b) => b - a);
  const upper = sortedSizes.find((marker) => marker >= size);
  const lower = [...sortedSizes].reverse().find((marker) => marker <= size);

  if (upper === lower) {
    return `${size} bp，与 ${upper} bp Marker 基本重合`;
  }

  if (!upper) {
    return `${size} bp，小于 100 bp Marker，迁移距离会更远`;
  }

  if (!lower) {
    return `${size} bp，大于 1000 bp Marker，迁移距离会更短`;
  }

  return `${size} bp，位于 ${upper} bp 与 ${lower} bp Marker 之间`;
}

function downloadText(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function LearningTip({ title, children }) {
  return (
    <Alert severity="info" icon={false} className="learning-tip">
      <Typography variant="subtitle1" fontWeight={800} gutterBottom>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {children}
      </Typography>
    </Alert>
  );
}

function StatusChip({ active, label }) {
  return (
    <Chip
      size="small"
      label={label}
      color={active ? 'primary' : 'default'}
      variant={active ? 'filled' : 'outlined'}
    />
  );
}

export default function App() {
  const [activeStep, setActiveStep] = useState(0);
  const [enzyme, setEnzyme] = useState('taq');
  const [hasBuffer, setHasBuffer] = useState(false);
  const [hasDntp, setHasDntp] = useState(false);
  const [dnaSequence, setDnaSequence] = useState(() => randomDna());
  const [productLengthMin, setProductLengthMin] = useState(200);
  const [productLengthMax, setProductLengthMax] = useState(300);
  const [primerForward, setPrimerForward] = useState('');
  const [primerReverse, setPrimerReverse] = useState('');
  const [primerSuggestions, setPrimerSuggestions] = useState([]);
  const [denaturationTemp, setDenaturationTemp] = useState(95);
  const [annealingTemp, setAnnealingTemp] = useState(55);
  const [extensionTemp, setExtensionTemp] = useState(72);
  const [cycles, setCycles] = useState(30);
  const [pcrProduct, setPcrProduct] = useState('');
  const [message, setMessage] = useState('');
  const [runningGel, setRunningGel] = useState(false);
  const [gelComplete, setGelComplete] = useState(false);
  const [gelImage, setGelImage] = useState('');
  const [sequenceComplete, setSequenceComplete] = useState(false);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);
  const messageTimerRef = useRef(null);

  const selectedEnzyme = enzymes[enzyme];
  const cleanedDna = cleanDna(dnaSequence);
  const cleanForward = cleanDna(primerForward);
  const cleanReverse = cleanDna(primerReverse);
  const forwardTm = calculateTm(cleanForward);
  const reverseTm = calculateTm(cleanReverse);
  const productSizeInterpretation = getMarkerRange(pcrProduct.length);

  const summary = useMemo(
    () => ({
      dnaSequence: cleanedDna,
      primerForward: cleanForward,
      primerReverse: cleanReverse,
      pcrProductLength: pcrProduct.length,
      denaturationTemp,
      annealingTemp,
      extensionTemp,
      cycles,
    }),
    [cleanedDna, cleanForward, cleanReverse, pcrProduct.length, denaturationTemp, annealingTemp, extensionTemp, cycles],
  );

  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(messageTimerRef.current);
    };
  }, []);

  function showMessage(text) {
    clearTimeout(messageTimerRef.current);
    setMessage(text);
    messageTimerRef.current = window.setTimeout(() => setMessage(''), 3600);
  }

  function moveToStep(step) {
    setActiveStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function loadFastaFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const sequence = String(readerEvent.target.result)
        .split(/\r?\n/)
        .filter((line) => !line.startsWith('>'))
        .join('');
      setDnaSequence(cleanDna(sequence));
      showMessage('FASTA 文件已读取，并自动去除了非 ATCG 字符。');
    };
    reader.readAsText(file);
  }

  function suggestPrimers() {
    const min = Number(productLengthMin);
    const max = Number(productLengthMax);

    if (!cleanedDna) {
      showMessage('请先输入或生成 DNA 模板序列。');
      return;
    }

    if (Number.isNaN(min) || Number.isNaN(max) || min < 50 || max > cleanedDna.length || min > max) {
      showMessage(`请输入 50 到 ${cleanedDna.length} bp 之间的有效产物长度范围。`);
      return;
    }

    const suggestions = [];
    for (let start = 0; start <= cleanedDna.length - min; start += 1) {
      for (let length = min; length <= max && start + length <= cleanedDna.length; length += 10) {
        const forward = cleanedDna.substring(start, start + 20);
        const reverse = reverseComplement(cleanedDna.substring(start + length - 20, start + length));
        const tmForward = calculateTm(forward);
        const tmReverse = calculateTm(reverse);

        if (forward.length === 20 && reverse.length === 20 && tmForward >= 50 && tmReverse >= 50) {
          suggestions.push({ forward, reverse, tmForward, tmReverse, length, start: start + 1 });
        }
      }
    }

    suggestions.sort((a, b) => (
      Math.abs(a.tmForward - 55) + Math.abs(a.tmReverse - 55)
      - Math.abs(b.tmForward - 55) - Math.abs(b.tmReverse - 55)
    ));

    setPrimerSuggestions(suggestions.slice(0, 8));
    showMessage(suggestions.length ? '已生成候选引物，点击卡片即可填入。' : '没有找到合适引物，请调整产物长度范围。');
  }

  function validatePrimerStep() {
    if (!hasBuffer || !hasDntp || !enzyme) {
      showMessage('请先在步骤 0 完成缓冲液、dNTP 和酶的选择。');
      moveToStep(0);
      return false;
    }

    if (!cleanedDna) {
      showMessage('请提供 DNA 模板序列。');
      return false;
    }

    if (cleanForward.length < 12 || cleanReverse.length < 12) {
      showMessage('两条引物长度都建议至少 12 个碱基，本模拟器按 12 bp 作为最低要求。');
      return false;
    }

    return true;
  }

  function runPcr() {
    if (!validatePrimerStep()) return;

    if (Number(denaturationTemp) < 92) {
      showMessage('变性温度过低。DNA 双链通常需要较高温度才能解旋。');
      return;
    }

    if (Number(annealingTemp) > forwardTm + 5 || Number(annealingTemp) > reverseTm + 5) {
      showMessage('退火温度高于引物 Tm 太多，引物可能难以结合模板。');
      return;
    }

    if (Math.abs(Number(extensionTemp) - selectedEnzyme.optimalTemp) > 2) {
      showMessage(`延伸温度应尽量接近 ${selectedEnzyme.label} 的最佳温度 ${selectedEnzyme.optimalTemp}°C。`);
      return;
    }

    const reverseBinding = reverseComplement(cleanReverse);
    const startIndex = cleanedDna.indexOf(cleanForward);
    const endStartIndex = cleanedDna.indexOf(reverseBinding, startIndex + cleanForward.length);

    if (startIndex >= 0 && endStartIndex >= 0) {
      setPcrProduct(cleanedDna.substring(startIndex, endStartIndex + cleanReverse.length));
      setGelComplete(false);
      setGelImage('');
      setSequenceComplete(false);
      moveToStep(3);
      showMessage('PCR 扩增成功，可以进入电泳检测。');
      return;
    }

    showMessage('引物没有在模板上形成正确配对，请重新选择或推荐引物。');
    moveToStep(1);
  }

  function drawGel(productLength = pcrProduct.length, progress = 1) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const markerLeft = 86;
    const markerRight = width - 126;
    const laneX = width / 2 - 20;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#050706';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(45, 212, 191, 0.12)';
    ctx.fillRect(markerLeft - 10, 54, 60, height - 96);
    ctx.fillRect(laneX - 10, 54, 60, height - 96);
    ctx.fillRect(markerRight - 10, 54, 60, height - 96);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.76)';
    ctx.font = 'bold 15px Microsoft YaHei, sans-serif';
    ctx.fillText('分子量标尺', 24, 30);
    ctx.fillText('泳道', width / 2 - 14, 30);

    markerSizes.forEach((size) => {
      const baseY = getGelBandY(size, height);
      const y = 54 + (baseY - 54) * progress;
      if (y < height - 42) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(24, y + 2.5);
        ctx.lineTo(width - 24, y + 2.5);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
        ctx.fillRect(markerLeft, y, 40, 5);
        ctx.fillRect(markerRight, y, 40, 5);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
        ctx.font = '12px Microsoft YaHei, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${size} bp`, markerLeft - 16, y + 7);
        ctx.textAlign = 'left';
        ctx.fillText(`${size} bp`, markerRight + 54, y + 7);
      }
    });

    if (productLength) {
      const baseY = getGelBandY(productLength, height);
      const y = 54 + (baseY - 54) * progress;
      const intensity = Math.max(0.24, Math.min((Number(cycles) - 22) / 10, 1));
      ctx.fillStyle = `rgba(94, 234, 212, ${intensity})`;
      ctx.shadowColor = 'rgba(94, 234, 212, 0.95)';
      ctx.shadowBlur = 18;
      ctx.fillRect(laneX, y, 42, 6);
      ctx.shadowBlur = 0;

      if (progress >= 0.98) {
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.95)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(laneX + 48, y + 3);
        ctx.lineTo(laneX + 96, y + 3);
        ctx.stroke();

        ctx.fillStyle = 'rgba(251, 191, 36, 0.98)';
        ctx.font = 'bold 13px Microsoft YaHei, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`PCR 产物：${productLength} bp`, laneX + 104, y + 7);
      }
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = '14px Microsoft YaHei, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Marker', markerLeft - 4, height - 16);
    ctx.fillText('PCR', laneX + 7, height - 16);
    ctx.fillText('Marker', markerRight - 4, height - 16);
  }

  function performElectrophoresis() {
    if (!pcrProduct) {
      showMessage('请先运行 PCR，得到产物后再进行电泳。');
      moveToStep(2);
      return;
    }

    clearInterval(intervalRef.current);
    setRunningGel(true);
    setGelComplete(false);
    let progress = 0;

    intervalRef.current = window.setInterval(() => {
      progress += 0.035;
      drawGel(pcrProduct.length, Math.min(progress, 1));

      if (progress >= 1) {
        clearInterval(intervalRef.current);
        setRunningGel(false);
        setGelComplete(true);
        setGelImage(canvasRef.current.toDataURL('image/png'));
        setSequenceComplete(true);
        showMessage('电泳完成：PCR 产物条带已显示在泳道中。');
      }
    }, 60);
  }

  function stopElectrophoresis() {
    clearInterval(intervalRef.current);
    setRunningGel(false);
    showMessage('电泳已暂停，可以重新运行。');
  }

  function showGelResultImmediately() {
    if (!pcrProduct) {
      showMessage('请先运行 PCR，得到产物后再查看电泳结果。');
      return;
    }

    clearInterval(intervalRef.current);
    setRunningGel(false);
    drawGel(pcrProduct.length, 1);
    setGelComplete(true);
    setGelImage(canvasRef.current.toDataURL('image/png'));
    setSequenceComplete(true);
    showMessage('已直接显示电泳结果。');
  }

  function downloadForwardFasta() {
    downloadText('pcr_product.fasta', `>PCR_Product\n${pcrProduct}`);
  }

  function downloadReverseFasta() {
    downloadText('reverse_pcr_product.fasta', `>Reverse_PCR_Product\n${reverseComplement(pcrProduct)}`);
  }

  function downloadHtmlResult() {
    const canvasImage = canvasRef.current ? canvasRef.current.toDataURL('image/png') : '';
    const html = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>PCR 模拟结果</title></head>
<body>
  <h1>PCR 模拟结果</h1>
  <p>原始 DNA 序列：${summary.dnaSequence}</p>
  <p>正向引物：${summary.primerForward}（长度：${summary.primerForward.length} 个碱基，Tm：${forwardTm}°C）</p>
  <p>反向引物：${summary.primerReverse}（长度：${summary.primerReverse.length} 个碱基，Tm：${reverseTm}°C）</p>
  <p>PCR 产物长度：${summary.pcrProductLength} 个碱基</p>
  <p>变性温度：${summary.denaturationTemp}°C</p>
  <p>退火温度：${summary.annealingTemp}°C</p>
  <p>延伸温度：${summary.extensionTemp}°C</p>
  <p>循环次数：${summary.cycles}</p>
  ${canvasImage ? `<img src="${canvasImage}" alt="凝胶电泳结果">` : ''}
</body>
</html>`;
    downloadText('pcr_simulation_results.html', html, 'text/html;charset=utf-8');
  }

  function renderMasterMixStep() {
    return (
      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Stack spacing={3}>
                <Typography variant="h5">步骤 0：配制 PCR 反应体系</Typography>
                <LearningTip title="学习提示：PCR 需要哪些基本成分？">
                  PCR 体系通常包含模板 DNA、引物、耐高温 DNA 聚合酶、四种脱氧核苷酸和缓冲液。可以把它理解为“复制 DNA 的材料包”。
                </LearningTip>
                <FormControl fullWidth>
                  <InputLabel id="enzyme-label">选择聚合酶</InputLabel>
                  <Select
                    labelId="enzyme-label"
                    value={enzyme}
                    label="选择聚合酶"
                    onChange={(event) => {
                      setEnzyme(event.target.value);
                      setExtensionTemp(enzymes[event.target.value].optimalTemp);
                    }}
                  >
                    {Object.entries(enzymes).map(([value, item]) => (
                      <MenuItem key={value} value={value}>
                        {item.label}，最佳延伸温度 {item.optimalTemp}°C
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Alert severity="success">
                  {selectedEnzyme.note} 当前建议延伸温度：{selectedEnzyme.optimalTemp}°C。
                </Alert>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <Button variant={hasBuffer ? 'contained' : 'outlined'} onClick={() => setHasBuffer(true)}>
                    添加缓冲液
                  </Button>
                  <Button variant={hasDntp ? 'contained' : 'outlined'} onClick={() => setHasDntp(true)}>
                    添加 dNTP
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={5}>
          <Paper className="side-panel">
            <Typography variant="h6" gutterBottom>当前反应体系</Typography>
            <Stack direction="row" flexWrap="wrap" gap={1} mb={2}>
              <StatusChip active={hasBuffer} label={hasBuffer ? '缓冲液已添加' : '缺少缓冲液'} />
              <StatusChip active={hasDntp} label={hasDntp ? 'dNTP 已添加' : '缺少 dNTP'} />
              <StatusChip active={Boolean(enzyme)} label={selectedEnzyme.label} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              操作提示：先确认反应体系，再进入模板和引物设计。缓冲液提供适宜的离子环境，dNTP 是合成新 DNA 链的原料。
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    );
  }

  function renderPrimerStep() {
    return (
      <Grid container spacing={3}>
        <Grid item xs={12} lg={7}>
          <Card>
            <CardContent>
              <Stack spacing={3}>
                <Typography variant="h5">步骤 1：添加模板 DNA 与引物</Typography>
                <LearningTip title="学习提示：引物决定扩增的起点和终点">
                  教材中 PCR 技术强调“根据目的基因两端序列设计引物”。正向引物和反向引物分别与两条模板链结合，框定需要扩增的 DNA 片段。
                </LearningTip>
                <TextField
                  label="DNA 模板序列"
                  value={dnaSequence}
                  onChange={(event) => setDnaSequence(cleanDna(event.target.value))}
                  multiline
                  minRows={5}
                  helperText={`当前有效长度：${cleanedDna.length} bp，仅保留 A/T/C/G`}
                  fullWidth
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <Button variant="contained" onClick={() => setDnaSequence(randomDna())}>
                    生成 500 bp 模板
                  </Button>
                  <Button variant="outlined" component="label">
                    导入 FASTA 文件
                    <input hidden type="file" accept=".fasta,.fa,.txt" onChange={loadFastaFile} />
                  </Button>
                </Stack>
                <Divider />
                <Grid container className="input-grid" spacing={2.5}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      type="number"
                      label="产物最小长度 bp"
                      value={productLengthMin}
                      onChange={(event) => setProductLengthMin(event.target.value)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      type="number"
                      label="产物最大长度 bp"
                      value={productLengthMax}
                      onChange={(event) => setProductLengthMax(event.target.value)}
                      fullWidth
                    />
                  </Grid>
                </Grid>
                <Button variant="contained" color="secondary" onClick={suggestPrimers}>
                  推荐引物
                </Button>
                <Grid container className="input-grid" spacing={2.5}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="正向引物"
                      value={primerForward}
                      onChange={(event) => setPrimerForward(cleanDna(event.target.value))}
                      helperText={`长度 ${cleanForward.length} bp，Tm ${forwardTm}°C`}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="反向引物"
                      value={primerReverse}
                      onChange={(event) => setPrimerReverse(cleanDna(event.target.value))}
                      helperText={`长度 ${cleanReverse.length} bp，Tm ${reverseTm}°C`}
                      fullWidth
                    />
                  </Grid>
                </Grid>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} lg={5}>
          <Paper className="side-panel">
            <Typography variant="h6" gutterBottom>候选引物</Typography>
            {primerSuggestions.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                点击“推荐引物”后，这里会显示适合当前模板和产物长度范围的候选组合。
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {primerSuggestions.map((pair, index) => (
                  <Paper
                    key={`${pair.forward}-${pair.reverse}-${index}`}
                    className="primer-card"
                    onClick={() => {
                      setPrimerForward(pair.forward);
                      setPrimerReverse(pair.reverse);
                    }}
                  >
                    <Typography variant="subtitle2">候选 {index + 1}：产物约 {pair.length} bp</Typography>
                    <Typography variant="caption" component="p">起始位置：第 {pair.start} 个碱基</Typography>
                    <Typography variant="caption" component="p">正向：{pair.forward}</Typography>
                    <Typography variant="caption" component="p">反向：{pair.reverse}</Typography>
                    <Typography variant="caption" component="p">Tm：{pair.tmForward}°C / {pair.tmReverse}°C</Typography>
                  </Paper>
                ))}
              </Stack>
            )}
          </Paper>
        </Grid>
      </Grid>
    );
  }

  function renderSettingsStep() {
    return (
      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Stack spacing={3}>
                <Typography variant="h5">步骤 2：设置 PCR 温度循环</Typography>
                <LearningTip title="学习提示：PCR 的三个关键阶段">
                  变性使 DNA 双链解开，退火使引物与模板结合，延伸则由 DNA 聚合酶沿模板合成新链。多个循环会让目标片段数量近似指数增加。
                </LearningTip>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField type="number" label="变性温度 °C" value={denaturationTemp} onChange={(event) => setDenaturationTemp(event.target.value)} fullWidth />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField type="number" label="退火温度 °C" value={annealingTemp} onChange={(event) => setAnnealingTemp(event.target.value)} fullWidth />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField type="number" label="延伸温度 °C" value={extensionTemp} onChange={(event) => setExtensionTemp(event.target.value)} fullWidth />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField type="number" label="循环次数" value={cycles} onChange={(event) => setCycles(event.target.value)} fullWidth />
                  </Grid>
                </Grid>
                <Button variant="contained" onClick={runPcr}>运行 PCR</Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={5}>
          <Paper className="side-panel">
            <Typography variant="h6" gutterBottom>参数检查</Typography>
            <List dense>
              <ListItem>
                <ListItemIcon><Chip size="small" label="1" /></ListItemIcon>
                <ListItemText primary="变性温度建议 ≥ 92°C" secondary={`当前：${denaturationTemp}°C`} />
              </ListItem>
              <ListItem>
                <ListItemIcon><Chip size="small" label="2" /></ListItemIcon>
                <ListItemText primary="退火温度应接近引物 Tm" secondary={`正向 Tm ${forwardTm}°C，反向 Tm ${reverseTm}°C`} />
              </ListItem>
              <ListItem>
                <ListItemIcon><Chip size="small" label="3" /></ListItemIcon>
                <ListItemText primary="延伸温度应匹配聚合酶" secondary={`${selectedEnzyme.label} 最佳 ${selectedEnzyme.optimalTemp}°C`} />
              </ListItem>
            </List>
          </Paper>
        </Grid>
      </Grid>
    );
  }

  function renderGelStep() {
    return (
      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Stack spacing={3}>
                <Typography variant="h5">步骤 3：凝胶电泳检测</Typography>
                <LearningTip title="学习提示：为什么要跑电泳？">
                  琼脂糖凝胶电泳可以按 DNA 片段大小分离 PCR 产物。条带位置可与 Marker 比较，用来判断是否扩增出预期大小的目的片段。
                </LearningTip>
                <Box className="gel-frame">
                  <canvas ref={canvasRef} width="560" height="560" />
                </Box>
                {runningGel && <LinearProgress />}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <Button variant="contained" onClick={performElectrophoresis} disabled={runningGel}>
                    运行电泳
                  </Button>
                  <Button variant="outlined" onClick={stopElectrophoresis} disabled={!runningGel}>
                    停止电泳
                  </Button>
                  <Button variant="text" onClick={showGelResultImmediately} disabled={!pcrProduct}>
                    直接显示结果
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={5}>
          <Paper className="side-panel">
            <Typography variant="h6" gutterBottom>结果概览</Typography>
            {pcrProduct ? (
              <Stack spacing={2}>
                <Chip color="primary" label={`PCR 产物：${pcrProduct.length} bp`} />
                <Alert severity="success">
                  读数结论：{productSizeInterpretation}
                </Alert>
                <Typography variant="body2" color="text.secondary">
                  读图方法：先找到 PCR 泳道中的亮条带，再与两侧 Marker 的高度比较。DNA 片段越小，在凝胶中迁移得越远，位置越靠下。
                </Typography>
                <Divider />
                <Typography variant="subtitle2">Marker 对照</Typography>
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  {markerSizes.map((size) => (
                    <Chip
                      key={size}
                      size="small"
                      label={`${size} bp`}
                      color={size === pcrProduct.length ? 'secondary' : 'default'}
                      variant={size === pcrProduct.length ? 'filled' : 'outlined'}
                    />
                  ))}
                </Stack>
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">还没有 PCR 产物，请先回到步骤 2 运行 PCR。</Typography>
            )}
          </Paper>
        </Grid>
      </Grid>
    );
  }

  function renderSequencingStep() {
    return (
      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Stack spacing={3}>
                <Typography variant="h5">步骤 4：切胶回收与测序</Typography>
                <LearningTip title="学习提示：从“看到条带”到“确认序列”">
                  电泳确认片段大小后，可以回收目的条带并进行测序。测序结果可用于进一步验证扩增片段是否为目标 DNA。
                </LearningTip>
                {!gelComplete && (
                  <Alert severity="warning">
                    请先在步骤 3 完成电泳检测，再查看切胶回收与测序结果。
                  </Alert>
                )}
                {gelComplete && (
                  <Alert severity="success">
                    已根据电泳条带完成模拟切胶回收，并生成测序结果。PCR 产物长度为 {pcrProduct.length} bp。
                  </Alert>
                )}
                {gelImage && (
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>回收的凝胶图像</Typography>
                    <img className="gel-preview" src={gelImage} alt="回收的凝胶条带图像" />
                  </Box>
                )}
                {sequenceComplete && (
                  <Paper className="result-card">
                    <Typography variant="subtitle1" fontWeight={800} gutterBottom>
                      测序结果摘要
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      正向序列与 PCR 产物一致；反向测序文件提供该产物的反向互补序列。可以在右侧下载 FASTA 或 HTML 实验结果。
                    </Typography>
                  </Paper>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={5}>
          <Paper className="side-panel">
            <Typography variant="h6" gutterBottom>下载结果</Typography>
            <Stack spacing={1.5}>
              <Button variant="outlined" onClick={downloadForwardFasta} disabled={!pcrProduct}>下载正向 FASTA</Button>
              <Button variant="outlined" onClick={downloadReverseFasta} disabled={!pcrProduct}>下载反向互补 FASTA</Button>
              <Button variant="contained" color="secondary" onClick={downloadHtmlResult} disabled={!pcrProduct}>下载 HTML 结果</Button>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    );
  }

  function renderSummaryBar() {
    return (
      <Paper className="summary-bar">
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between">
          <Box>
            <Typography variant="subtitle2" color="text.secondary">实验进度</Typography>
            <Typography variant="body2">
              模板 {cleanedDna.length} bp · 正向引物 {cleanForward.length} bp · 反向引物 {cleanReverse.length} bp · 产物 {pcrProduct.length || '--'} bp
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <StatusChip active={hasBuffer && hasDntp} label="反应体系" />
            <StatusChip active={Boolean(cleanForward && cleanReverse)} label="引物" />
            <StatusChip active={Boolean(pcrProduct)} label="PCR 产物" />
            <StatusChip active={gelComplete} label="电泳完成" />
          </Stack>
        </Stack>
      </Paper>
    );
  }

  const stepContent = [
    renderMasterMixStep(),
    renderPrimerStep(),
    renderSettingsStep(),
    renderGelStep(),
    renderSequencingStep(),
  ];

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box className="app-shell">
        <Container maxWidth="xl">
          <Card className="workspace">
            <CardContent>
              <Stepper nonLinear activeStep={activeStep} alternativeLabel className="stepper">
                {steps.map((label, index) => (
                  <Step key={label} completed={index < activeStep}>
                    <StepButton color="inherit" onClick={() => moveToStep(index)}>
                      {label}
                    </StepButton>
                  </Step>
                ))}
              </Stepper>

              {message && (
                <Alert severity="warning" sx={{ mb: 3 }}>
                  {message}
                </Alert>
              )}

              {renderSummaryBar()}

              <Box mt={3}>{stepContent[activeStep]}</Box>

              <Stack direction="row" spacing={2} justifyContent="space-between" mt={4}>
                <Button disabled={activeStep === 0} onClick={() => moveToStep(activeStep - 1)}>
                  上一步
                </Button>
                <Button
                  variant="contained"
                  disabled={activeStep === steps.length - 1}
                  onClick={() => moveToStep(activeStep + 1)}
                >
                  下一步
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Container>
      </Box>
    </ThemeProvider>
  );
}
