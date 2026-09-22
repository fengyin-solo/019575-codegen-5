/**
 * 配置常量
 */
const CONFIG = {
    // 应用版本
    VERSION: '1.0.0',
    
    // 存储键名
    STORAGE_KEYS: {
        DESIGNS: 'optics_designs',
        SETTINGS: 'optics_settings',
        GUIDE_COMPLETED: 'optics_guide_completed',
        RECORDING: 'optics_experiment_recording',
        PLAYBACK: 'optics_experiment_playback'
    },
    
    // 透镜类型
    LENS_TYPES: {
        CONVEX: 'convex',
        CONCAVE: 'concave',
        PLANO: 'plano',
        ASPHERIC: 'aspheric'
    },
    
    // 材料类型
    MATERIALS: {
        NORMAL: {
            id: 'normal',
            name: '普通玻璃',
            refractiveIndex: 1.5,
            dispersion: 0.4  // 普通玻璃色散较大
        },
        HIGH_INDEX: {
            id: 'highIndex',
            name: '高折射率镜片',
            refractiveIndex: 1.7,
            dispersion: 0.35  // 高折射率通常色散也较大
        },
        LOW_DISPERSION: {
            id: 'lowDispersion',
            name: '低色散镜片',
            refractiveIndex: 1.52,
            dispersion: 0.08  // ED玻璃，色散很小
        }
    },
    
    // 透镜默认参数
    LENS_DEFAULTS: {
        refractiveIndex: 1.5,
        size: 100,
        curvature: 50,
        material: 'normal'
    },
    
    // 光源类型
    LIGHT_MODES: {
        PARALLEL: 'parallel',
        POINT: 'point'
    },
    
    // 光路默认参数
    LIGHT_DEFAULTS: {
        mode: 'parallel',
        rayCount: 5,
        angle: 0,
        wavelength: 550 // 绿光波长(nm)
    },
    
    // 颜色配置
    COLORS: {
        INCIDENT_RAY: '#E74C3C',
        REFRACTED_RAY: '#3498DB',
        RAY_RED: '#E74C3C',
        RAY_GREEN: '#27AE60',
        RAY_BLUE: '#3498DB',
        LENS_FILL: 'rgba(74, 144, 226, 0.3)',
        LENS_STROKE: '#4A90E2',
        LENS_SELECTED: '#2ECC71',
        OPTICAL_AXIS: '#999999',
        FOCAL_POINT: '#E74C3C',
        GRID: '#E5E5E5'
    },
    
    // 渲染配置
    RENDER: {
        RAY_WIDTH: 2,
        LENS_STROKE_WIDTH: 2,
        FOCAL_POINT_RADIUS: 5,
        ANIMATION_DURATION: 300,
        UPDATE_DELAY: 50
    },
    
    // 帮助文本
    HELP_TEXTS: {
        convex: '凸透镜：中间厚、边缘薄，可以让光线汇聚到一点（焦点）。边缘光线会有轻微球差。',
        concave: '凹透镜：中间薄、边缘厚，可以让光线发散开来',
        plano: '平面透镜：两面都是平的，光线穿过时方向不变',
        aspheric: '非球面透镜：表面曲率从中心到边缘逐渐变化，能消除球差，让所有光线精准汇聚到同一焦点',
        lowDispersion: '低色散镜片（ED玻璃）：阿贝数高，不同颜色的光折射角度几乎相同，成像更清晰无彩边',
        highIndex: '高折射率镜片：更薄更轻，聚光能力更强，但色散也较明显',
        refractiveIndex: '折射率：数值越大，光线偏折越明显。不同颜色光的折射率略有不同，这就是色散的原因',
        curvature: '弧度：调节透镜的弯曲程度，影响焦距和球差'
    },
    
    // 知识点提示
    KNOWLEDGE_TIPS: [
        '光从空气进入玻璃会向法线偏折',
        '凸透镜可以把平行光汇聚到焦点',
        '凹透镜可以把光线发散开来',
        '折射率越大，光线偏折越明显',
        '不同颜色的光折射程度不同，这就是色散',
        '蓝光折射率最大，红光折射率最小',
        '非球面透镜可以消除球差，让光线更精准汇聚',
        '球面透镜的边缘光线会偏折过度，产生球差',
        '低色散镜片（ED玻璃）可以减少彩色边缘',
        '近视眼镜用凹透镜，远视眼镜用凸透镜',
        '放大镜就是一个凸透镜',
        '光在同一种介质中沿直线传播',
        '光的传播速度在不同介质中不同',
        '阿贝数越大，色散越小',
        '相机镜头常用非球面透镜来提高成像质量'
    ],
    
    // 测验题库
    QUIZ_QUESTIONS: [
        {
            id: 'focus_convex',
            title: '平行光聚焦实验',
            description: '请选择合适的透镜和参数，使平行光能够精准会聚到一点。',
            requirements: {
                lensType: 'convex',
                lightMode: 'parallel',
                minFocalLength: 50,
                maxFocalLength: 300
            },
            validation: {
                checkType: true,
                checkConvergence: true,
                checkLightMode: true
            },
            explanation: {
                correct: '太棒了！凸透镜对光线有会聚作用，平行于主光轴的光线经过凸透镜后会会聚到焦点上。',
                wrongType: '这道题需要使用凸透镜。凹透镜会使光线发散，无法会聚到一点；平面透镜不会改变光线方向。',
                noConvergence: '光线没有会聚到一点。请尝试增大折射率或曲率，增强透镜的会聚能力。',
                wrongLightMode: '请切换到平行光模式，这样才能观察到平行光聚焦的效果。'
            },
            hints: [
                '凸透镜中间厚边缘薄，能使光线会聚',
                '折射率越大，光线偏折越明显',
                '曲率越大，透镜弯曲程度越大，会聚能力越强'
            ]
        },
        {
            id: 'diverge_concave',
            title: '光线发散实验',
            description: '请选择合适的透镜，使平行光通过后向外发散开来。',
            requirements: {
                lensType: 'concave',
                lightMode: 'parallel'
            },
            validation: {
                checkType: true,
                checkDivergence: true,
                checkLightMode: true
            },
            explanation: {
                correct: '正确！凹透镜中间薄边缘厚，对光线有发散作用。光线通过凹透镜后会向外发散，其反向延长线会交于虚焦点。',
                wrongType: '这道题需要使用凹透镜。凸透镜会使光线会聚，平面透镜不会改变光线方向。',
                noDivergence: '光线没有明显发散。请尝试增大折射率或曲率，增强透镜的发散能力。',
                wrongLightMode: '请切换到平行光模式，这样才能清晰观察到发散效果。'
            },
            hints: [
                '凹透镜中间薄边缘厚，能使光线发散',
                '近视眼镜就是凹透镜制成的',
                '凹透镜成的是正立、缩小的虚像'
            ]
        },
        {
            id: 'no_deflection_plano',
            title: '光线直线传播实验',
            description: '请选择合适的透镜，使光线通过后方向不发生改变。',
            requirements: {
                lensType: 'plano'
            },
            validation: {
                checkType: true,
                checkNoDeflection: true
            },
            explanation: {
                correct: '完全正确！平面透镜的两个表面都是平行的，光线垂直入射时方向不变，只会发生微小的侧移。',
                wrongType: '这道题需要使用平面透镜。凸透镜会使光线会聚，凹透镜会使光线发散。',
                hasDeflection: '光线发生了偏折。请确认你选择的是平面透镜，并且光线是垂直入射的。'
            },
            hints: [
                '平面透镜的两个表面是平行的平面',
                '光在同一种均匀介质中沿直线传播',
                '平面透镜常用于保护光学元件'
            ]
        },
        {
            id: 'myopia_correction',
            title: '近视眼矫正',
            description: '近视眼的晶状体太厚，折光能力太强，成像在视网膜前方。请选择合适的透镜来矫正近视。',
            requirements: {
                lensType: 'concave',
                minRefractiveIndex: 1.4,
                maxRefractiveIndex: 1.6
            },
            validation: {
                checkType: true,
                checkRefractiveIndex: true
            },
            explanation: {
                correct: '非常好！近视眼镜是凹透镜，它能先使光线发散一些，再经过晶状体会聚，就能让像正好成在视网膜上。',
                wrongType: '近视眼需要用凹透镜矫正。凸透镜会使光线更会聚，成像会更靠前；远视眼才用凸透镜矫正。',
                wrongRI: '折射率不太合适。普通眼镜片的折射率通常在1.5左右，请调整到合适范围。'
            },
            hints: [
                '近视眼成像在视网膜前方',
                '凹透镜对光线有发散作用',
                '近视眼镜的度数是负数'
            ]
        },
        {
            id: 'hyperopia_correction',
            title: '远视眼矫正',
            description: '远视眼的晶状体太薄，折光能力太弱，成像在视网膜后方。请选择合适的透镜来矫正远视。',
            requirements: {
                lensType: 'convex',
                minRefractiveIndex: 1.4,
                maxRefractiveIndex: 1.6
            },
            validation: {
                checkType: true,
                checkRefractiveIndex: true
            },
            explanation: {
                correct: '完美！远视眼镜是凸透镜，它能先使光线会聚一些，再经过晶状体会聚，就能让像正好成在视网膜上。老花镜就是凸透镜。',
                wrongType: '远视眼需要用凸透镜矫正。凹透镜会使光线更发散，成像会更靠后；近视眼才用凹透镜矫正。',
                wrongRI: '折射率不太合适。普通眼镜片的折射率通常在1.5左右，请调整到合适范围。'
            },
            hints: [
                '远视眼成像在视网膜后方',
                '凸透镜对光线有会聚作用',
                '老花镜的度数是正数'
            ]
        },
        {
            id: 'magnifier',
            title: '制作放大镜',
            description: '放大镜是一种常用的光学仪器，请选择合适的透镜和参数，制作一个聚光能力较强的放大镜。',
            requirements: {
                lensType: 'convex',
                minCurvature: 50,
                maxCurvature: 90,
                minRefractiveIndex: 1.5
            },
            validation: {
                checkType: true,
                checkCurvature: true,
                checkRefractiveIndex: true
            },
            explanation: {
                correct: '太棒了！放大镜就是一个焦距较短的凸透镜。曲率越大、折射率越高，焦距越短，放大倍数越大。当物距小于焦距时，成正立、放大的虚像。',
                wrongType: '放大镜需要使用凸透镜。凹透镜成的是缩小的像，无法作为放大镜使用。',
                wrongCurvature: '曲率太小了，放大镜需要较大的曲率才能获得较短的焦距和较大的放大倍数。',
                wrongRI: '折射率不够大，放大镜需要较高的折射率来获得更强的聚光能力。'
            },
            hints: [
                '放大镜是一个短焦距的凸透镜',
                '物距小于焦距时成正立放大的虚像',
                '曲率越大，焦距越短，放大倍数越大'
            ]
        },
        {
            id: 'dispersion_demo',
            title: '色散现象演示',
            description: '白光通过透镜时会发生色散，不同颜色的光偏折程度不同。请选择合适的材料和参数，观察明显的色散现象。',
            requirements: {
                lensType: 'convex',
                material: 'normal',
                minCurvature: 60
            },
            validation: {
                checkType: true,
                checkMaterial: true,
                checkCurvature: true,
                checkDispersion: true
            },
            explanation: {
                correct: '正确！普通玻璃的色散较大，白光通过时会分解成红、绿、蓝等颜色。蓝光折射率最大，偏折最多；红光折射率最小，偏折最少。',
                wrongType: '请使用凸透镜来观察色散现象，光线需要偏折才能观察到色散。',
                wrongMaterial: '低色散镜片（ED玻璃）的色散很小，不容易观察到色散现象。请使用普通玻璃材料。',
                wrongCurvature: '曲率太小，光线偏折不明显，色散现象也不明显。请增大曲率。',
                noDispersion: '色散现象不明显。请尝试增大入射角，让光线斜着入射，这样色散会更明显。'
            },
            hints: [
                '白光是由多种颜色的光组成的',
                '不同颜色的光折射率不同',
                '蓝光偏折最多，红光偏折最少',
                '让光线斜入射，色散更明显'
            ]
        },
        {
            id: 'low_dispersion_lens',
            title: '低色散镜头设计',
            description: '在摄影中，色散会产生彩色边缘，影响画质。请选择合适的材料设计一个低色散镜头。',
            requirements: {
                lensType: 'convex',
                material: 'lowDispersion'
            },
            validation: {
                checkType: true,
                checkMaterial: true,
                checkLowDispersion: true
            },
            explanation: {
                correct: '专业！低色散镜片（ED玻璃）的阿贝数很高，不同颜色的光折射率几乎相同，能有效消除彩色边缘，显著提高成像质量。',
                wrongType: '摄影镜头通常使用凸透镜作为主要镜片。',
                wrongMaterial: '请选择低色散镜片（ED玻璃）材料。普通玻璃的色散较大，高折射率镜片的色散也比较明显。',
                highDispersion: '色散还是比较明显。请确认你选择的是低色散镜片材料。'
            },
            hints: [
                '低色散镜片简称ED玻璃',
                '阿贝数越大，色散越小',
                '专业相机镜头常用ED玻璃'
            ]
        },
        {
            id: 'spherical_aberration',
            title: '球差现象观察',
            description: '球面透镜的边缘光线和中心光线会聚点不同，这就是球差。请观察球面透镜的球差现象。',
            requirements: {
                lensType: 'convex',
                lightMode: 'parallel',
                minCurvature: 60
            },
            validation: {
                checkType: true,
                checkLightMode: true,
                checkCurvature: true,
                checkSphericalAberration: true
            },
            explanation: {
                correct: '观察得很仔细！球面透镜的边缘光线比中心光线偏折更多，导致球差。你可以看到边缘光线会聚在更靠近透镜的位置。',
                wrongType: '请使用凸透镜来观察球差现象。',
                wrongLightMode: '请切换到平行光模式，这样才能清晰观察到球差。',
                wrongCurvature: '曲率太小，球差不明显。请增大曲率，球差会更显著。',
                noAberration: '球差不明显。请尝试增大曲率，或者使用非球面透镜对比观察。'
            },
            hints: [
                '球面透镜存在球差',
                '边缘光线比中心光线偏折更多',
                '曲率越大，球差越明显',
                '非球面透镜可以消除球差'
            ]
        },
        {
            id: 'aspheric_correction',
            title: '非球面透镜消球差',
            description: '非球面透镜可以消除球差，让所有光线精准会聚。请对比观察非球面透镜和球面透镜的区别。',
            requirements: {
                lensType: 'aspheric',
                lightMode: 'parallel'
            },
            validation: {
                checkType: true,
                checkLightMode: true,
                checkNoSphericalAberration: true
            },
            explanation: {
                correct: '非常专业！非球面透镜通过改变表面曲率，从中心到边缘逐渐变化，完美补偿了球差，让所有光线都能会聚到同一点，成像更清晰。',
                wrongType: '请使用非球面透镜。球面透镜存在球差，边缘光线会聚点与中心不同。',
                wrongLightMode: '请切换到平行光模式，这样才能清晰观察到非球面透镜的消球差效果。',
                hasAberration: '还是有球差存在。请确认你选择的是非球面透镜。'
            },
            hints: [
                '非球面透镜可以消除球差',
                '表面曲率从中心到边缘逐渐变化',
                '所有光线会聚到同一点',
                '高端镜头常用非球面透镜'
            ]
        }
    ],
    
    // 预设案例
    PRESETS: {
        magnifier: {
            name: '放大镜成像',
            lenses: [
                {
                    type: 'convex',
                    x: 0.5,
                    y: 0.5,
                    refractiveIndex: 1.5,
                    size: 120,
                    curvature: 60,
                    material: 'normal'
                }
            ],
            light: {
                mode: 'parallel',
                rayCount: 5,
                angle: 0
            }
        },
        myopia: {
            name: '近视眼镜矫正',
            lenses: [
                {
                    type: 'concave',
                    x: 0.5,
                    y: 0.5,
                    refractiveIndex: 1.5,
                    size: 100,
                    curvature: 40,
                    material: 'normal'
                }
            ],
            light: {
                mode: 'parallel',
                rayCount: 5,
                angle: 0
            }
        },
        dispersion: {
            name: '色散现象',
            lenses: [
                {
                    type: 'convex',
                    x: 0.5,
                    y: 0.5,
                    refractiveIndex: 1.6,
                    size: 100,
                    curvature: 70,
                    material: 'normal'
                }
            ],
            light: {
                mode: 'parallel',
                rayCount: 3,
                angle: 15
            },
            showDispersion: true
        }
    }
};

// 冻结配置对象，防止意外修改
Object.freeze(CONFIG);
Object.freeze(CONFIG.STORAGE_KEYS);
Object.freeze(CONFIG.LENS_TYPES);
Object.freeze(CONFIG.MATERIALS);
Object.freeze(CONFIG.LENS_DEFAULTS);
Object.freeze(CONFIG.LIGHT_MODES);
Object.freeze(CONFIG.LIGHT_DEFAULTS);
Object.freeze(CONFIG.COLORS);
Object.freeze(CONFIG.RENDER);
Object.freeze(CONFIG.HELP_TEXTS);
Object.freeze(CONFIG.PRESETS);
Object.freeze(CONFIG.QUIZ_QUESTIONS);
