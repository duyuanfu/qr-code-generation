package com.qrstudio;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.qrstudio.entity.User;
import com.qrstudio.mapper.UserMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.io.File;
import java.time.LocalDateTime;

@Slf4j
@SpringBootApplication
public class QrStudioApplication {

    public static void main(String[] args) {
        SpringApplication.run(QrStudioApplication.class, args);
    }

    @Bean
    public CommandLineRunner initDatabaseAndAdmin(
            UserMapper userMapper,
            PasswordEncoder passwordEncoder,
            @Value("${app.admin.email}") String adminEmail,
            // 不给默认值：这里以前直接写死了开发口令，等于给线上留了个后门。
            // 缺失时由 Spring 启动期报错，口令只可能来自环境变量或 application-dev.yml。
            @Value("${app.admin.password}") String adminPassword,
            @Value("${app.upload.dir:data/uploads}") String uploadDir) {
        return args -> {
            // 上传目录必须和 WebConfig / UploadController 读同一个配置项。
            // 这里以前写死成 "data/uploads"，一旦 APP_UPLOAD_DIR 改了（docker-compose 就设成
            // /app/data/uploads），启动时仍会在工作目录下建一个没人用的 data/uploads，
            // 真实目录反倒可能不存在 —— 上传直接 500。
            File uploadFolder = new File(uploadDir);
            if (!uploadFolder.exists() && !uploadFolder.mkdirs() && !uploadFolder.exists()) {
                log.error("无法创建上传目录: {}", uploadFolder.getAbsolutePath());
            } else {
                // 相对路径依赖进程工作目录：从 backend/ 启动和从仓库根启动会落到不同位置。
                // 打个绝对路径出来，排查「上传成功但访问 404」时能一眼看出问题。
                log.info("上传目录: {}", uploadFolder.getAbsolutePath());
            }

            // Seed default admin account if not exists (credentials come from app.admin.* config)
            User existingAdmin = userMapper.selectOne(new LambdaQueryWrapper<User>().eq(User::getEmail, adminEmail));
            if (existingAdmin == null) {
                User admin = User.builder()
                        .email(adminEmail)
                        .password(passwordEncoder.encode(adminPassword))
                        .role("admin")
                        .status("active")
                        .createdAt(LocalDateTime.now())
                        .updatedAt(LocalDateTime.now())
                        .build();
                userMapper.insert(admin);
                System.out.println(">>> [QR Studio] Default Admin initialized: " + adminEmail);
            }
        };
    }
}
